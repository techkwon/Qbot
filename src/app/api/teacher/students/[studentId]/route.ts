import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { createAdminClient } from '@/lib/supabase/admin';

// !!! SECURITY WARNING !!!
// THESE SHOULD BE STORED IN ENVIRONMENT VARIABLES (.env.local)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
    params: {
        studentId: string;
    }
}

// Helper function to validate UUID format
const isUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id);
};

export async function GET(request: NextRequest, { params }: RouteParams) {
    const cookieStore = cookies();
    const { studentId } = params;

    if (!studentId) {
        return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. Create client with user context to check teacher role
    const supabaseUserClient = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // @ts-ignore next-app-router issue with cookies()
                get: (name: string) => cookieStore.get(name)?.value,
            },
        }
    );

    // 2. Verify teacher authentication and role
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    const { data: teacherProfile, error: profileError } = await supabaseUserClient
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

    if (profileError || !teacherProfile || teacherProfile.role !== 'teacher') {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 3. Create Supabase Admin Client to fetch student data
    const supabaseAdmin = createAdminClient();

    // 4. Fetch student profile by ID
    try {
        const { data: student, error: fetchError } = await supabaseAdmin
            .from('profiles')
            .select('id, user_id, full_name, student_id_number, class_id, created_at') // Include class_id for ownership check
            .eq('id', studentId)
            .eq('role', 'student') // Ensure we only fetch students
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') { // PostgREST error for 'exactly one record' (zero rows)
                return NextResponse.json({ error: '해당 학생을 찾을 수 없습니다.' }, { status: 404 });
            }
            console.error('Error fetching student:', fetchError);
            return NextResponse.json({ error: '학생 정보 조회 중 오류 발생: ' + fetchError.message }, { status: 500 });
        }

        if (!student || !student.class_id) {
             // If student not found OR student is not assigned to any class, teacher cannot 'own' them via class
             return NextResponse.json({ error: '해당 학생을 찾을 수 없거나 소속된 클래스가 없습니다.' }, { status: 404 });
        }

        // 5. Verify Teacher Ownership via Class
        const { data: teacherClasses, error: classesError } = await supabaseUserClient
            .from('classes')
            .select('id')
            .eq('teacher_id', user.id);

        if (classesError) {
            console.error('Error fetching teacher classes for ownership check:', classesError);
            return NextResponse.json({ error: '학생 소유권 확인 중 오류 발생.' }, { status: 500 });
        }

        const teacherClassIds = teacherClasses?.map(c => c.id) || [];

        if (!teacherClassIds.includes(student.class_id)) {
            // Teacher does not own the class this student belongs to
            return NextResponse.json({ error: '해당 학생 정보에 접근할 권한이 없습니다.' }, { status: 404 }); // Return 404 to obscure existence
        }

        // Ownership verified, return student data (exclude class_id if not needed in response)
        const { class_id, ...studentResponseData } = student; // Optionally remove class_id from response
        return NextResponse.json(studentResponseData, { status: 200 });

    } catch (error: any) {
        console.error('Error fetching student:', error);
        return NextResponse.json({ error: '학생 정보 조회 중 서버 오류 발생: ' + error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const { studentId } = params;

    if (!studentId) {
        return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    if (!isUUID(studentId)) {
        return NextResponse.json({ error: '잘못된 학생 프로필 ID 형식입니다.' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: { // @ts-ignore
                get: (name: string) => cookieStore.get(name)?.value,
            },
        }
    );
    const supabaseAdmin = createAdminClient();

    try {
        // 1. Verify user authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        // 2. Check if user is a teacher
        // (Could potentially be skipped if RLS + initial fetch guarantees ownership, but good for explicit check)
        const { data: teacherProfile, error: teacherCheckError } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (teacherCheckError || !teacherProfile || teacherProfile.role !== 'teacher') {
             return NextResponse.json({ error: '학생 정보를 수정할 권한이 없습니다.' }, { status: 403 });
        }

        // 3. Get update data from request body
        let updateData: { full_name?: string; student_id_number?: string; class_id?: string | null } = {};
        try {
            const body = await request.json();
            // Only include fields that are actually provided in the request
            if (body.hasOwnProperty('full_name')) {
                if (typeof body.full_name !== 'string' || body.full_name.trim().length === 0) throw new Error('학생 이름은 비워둘 수 없습니다.');
                updateData.full_name = body.full_name.trim();
            }
            if (body.hasOwnProperty('student_id_number')) {
                if (typeof body.student_id_number !== 'string' || body.student_id_number.trim().length === 0) throw new Error('학번은 비워둘 수 없습니다.');
                updateData.student_id_number = body.student_id_number.trim();
            }
            if (body.hasOwnProperty('class_id')) {
                if (body.class_id !== null && !isUUID(body.class_id)) throw new Error('잘못된 클래스 ID 형식입니다.');
                updateData.class_id = body.class_id; // Can be null to unassign
            }

            if (Object.keys(updateData).length === 0) {
                 return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
            }

        } catch (e: any) {
            return NextResponse.json({ error: e.message || '잘못된 요청 본문입니다.' }, { status: 400 });
        }

        // 4. Fetch the student's current profile to check ownership before update
        const { data: currentProfile, error: fetchError } = await supabase
            .from('profiles')
            .select('user_id, class_id') // Need user_id for potential auth update, class_id for ownership check
            .eq('id', studentId)
            .eq('role', 'student')
            .single();

        if (fetchError || !currentProfile) {
             return NextResponse.json({ error: '수정할 학생을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 5. Verify teacher ownership of the student (via current class)
        if (currentProfile.class_id) {
             const { data: classCheck, error: classCheckError } = await supabase
                .from('classes')
                .select('id')
                .eq('id', currentProfile.class_id)
                .eq('teacher_id', user.id)
                .maybeSingle();
            if (classCheckError || !classCheck) {
                 return NextResponse.json({ error: '이 학생을 수정할 권한이 없습니다 (현재 클래스 불일치).' }, { status: 403 });
            }
        } else {
            // If student has no class, can teacher modify? Assume no for now.
             return NextResponse.json({ error: '이 학생을 수정할 권한이 없습니다 (클래스 미배정).' }, { status: 403 });
        }

        // 6. If class_id is being changed, verify teacher ownership of the *new* class
        if (updateData.hasOwnProperty('class_id') && updateData.class_id !== null) {
            const { data: newClassCheck, error: newClassError } = await supabase
                .from('classes')
                .select('id')
                .eq('id', updateData.class_id)
                .eq('teacher_id', user.id) // Must own the new class too
                .single();
            if (newClassError || !newClassCheck) {
                 return NextResponse.json({ error: '지정하려는 새 클래스가 존재하지 않거나 접근 권한이 없습니다.' }, { status: 400 });
            }
        }

        // 7. Update the profile using Admin Client
        const { data: updatedProfile, error: updateError } = await supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', studentId!) // Add non-null assertion to fix TS error (9adfc2a6...)
            .select('id, user_id, full_name, student_id_number, role, class_id, created_at')
            .single();

        if (updateError) {
             console.error('프로필 업데이트 오류:', updateError);
             if (updateError.code === '23505') { // Unique constraint violation (e.g., student_id_number)
                 return NextResponse.json({ error: '이미 사용 중인 학번입니다.' }, { status: 409 });
             }
             if (updateError.code === 'PGRST116') { // Should not happen due to prior check, but handle just in case
                 return NextResponse.json({ error: '학생을 찾을 수 없어 업데이트하지 못했습니다.' }, { status: 404 });
             }
            return NextResponse.json({ error: '학생 정보 수정 중 오류가 발생했습니다.' }, { status: 500 });
        }

        // 8. Optionally, update auth.users metadata if name/student_id changed (requires user_id from fetch)
        if (updateData.full_name || updateData.student_id_number) {
            const authUpdateData: any = {};
            if (updateData.full_name) authUpdateData.full_name = updateData.full_name;
            if (updateData.student_id_number) authUpdateData.student_id_number = updateData.student_id_number;

            const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
                currentProfile.user_id, // Use the user_id fetched earlier
                { user_metadata: authUpdateData }
            );
            if (authUpdateError) {
                // Log this error but don't fail the whole request, profile update succeeded.
                console.error(`Auth 메타데이터 업데이트 실패 (사용자 ID: ${currentProfile.user_id}):`, authUpdateError);
            }
        }

        return NextResponse.json(updatedProfile);

    } catch (error: any) {
        console.error('예상치 못한 학생 수정 오류:', error);
        return NextResponse.json({ error: '학생 수정 중 예상치 못한 서버 오류 발생: ' + error.message }, { status: 500 });
    }
}

// DELETE: Delete a student profile and associated auth user
export async function DELETE(request: NextRequest, { params }: { params: { studentId: string } }) {
    const profileId = params.studentId; // Assuming studentId is the profile ID
    if (!isUUID(profileId)) {
        return NextResponse.json({ error: '잘못된 학생 프로필 ID 형식입니다.' }, { status: 400 });
    }

    const cookieStore = cookies();
    // Regular client for auth check and initial ownership verification
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: { // @ts-ignore
                get: (name: string) => cookieStore.get(name)?.value,
            },
        }
    );
    // Admin client for deletion
    const supabaseAdmin = createAdminClient();

    try {
        // 1. Verify user authentication
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        // 2. Check if user is a teacher (optional but good practice)
        const { data: teacherProfile, error: teacherCheckError } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();
        if (teacherCheckError || !teacherProfile || teacherProfile.role !== 'teacher') {
            return NextResponse.json({ error: '학생을 삭제할 권한이 없습니다.' }, { status: 403 });
        }

        // 3. Fetch the student's profile to get user_id and verify ownership
        const { data: studentToDelete, error: fetchError } = await supabase
            .from('profiles')
            .select('user_id, class_id') // Need user_id for auth deletion, class_id for ownership
            .eq('id', profileId)
            .eq('role', 'student')
            .single();

        if (fetchError || !studentToDelete) {
            // If already deleted or doesn't exist, return 404
            return NextResponse.json({ error: '삭제할 학생을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 4. Verify teacher ownership (via current class)
        if (studentToDelete.class_id) {
            const { data: classCheck, error: classCheckError } = await supabase
                .from('classes')
                .select('id')
                .eq('id', studentToDelete.class_id)
                .eq('teacher_id', user.id)
                .maybeSingle();
            if (classCheckError || !classCheck) {
                return NextResponse.json({ error: '이 학생을 삭제할 권한이 없습니다 (클래스 불일치).' }, { status: 403 });
            }
        } else {
            // If student has no class, can teacher delete? Assume no for now.
            return NextResponse.json({ error: '이 학생을 삭제할 권한이 없습니다 (클래스 미배정).' }, { status: 403 });
        }

        // 5. Delete the profile record first (using Admin Client)
        const { error: profileDeleteError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', profileId);

        if (profileDeleteError) {
            // Check if the error is 'PGRST116' (Not Found), might happen in race conditions
            if (profileDeleteError.code === 'PGRST116') {
                return NextResponse.json({ error: '삭제하려는 학생 프로필을 찾지 못했습니다 (이미 삭제되었을 수 있음).' }, { status: 404 });
            }
            console.error('프로필 삭제 오류:', profileDeleteError);
            return NextResponse.json({ error: '학생 프로필 삭제 중 오류가 발생했습니다.' }, { status: 500 });
        }

        // 6. Delete the associated auth user (using Admin Client)
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(studentToDelete.user_id);

        if (authDeleteError) {
            // Log the error but consider the main deletion (profile) successful if it reached here.
            // The profile is gone, but the auth user might linger. This requires manual cleanup or reconciliation logic.
            // If foreign key has ON DELETE CASCADE, this shouldn't error unless auth user was already gone.
            console.error(`Auth 사용자 삭제 오류 (사용자 ID: ${studentToDelete.user_id}):`, authDeleteError);
            // Optionally return a specific status/message indicating partial success or needing attention
            // For simplicity here, we'll log and proceed assuming profile deletion was the primary goal.
            // If auth user deletion *must* succeed, you'd handle this error more strictly.
        }

        // 7. Return success (204 No Content is typical for DELETE)
        return new Response(null, { status: 204 });

    } catch (error: any) {
        console.error('예상치 못한 학생 삭제 오류:', error);
        return NextResponse.json({ error: '학생 삭제 중 예상치 못한 서버 오류 발생: ' + error.message }, { status: 500 });
    }
}
