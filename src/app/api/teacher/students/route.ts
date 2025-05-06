import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/admin';
import Papa from 'papaparse';

// Helper function to validate UUID format
const isUUID = (id: string): boolean => {
    if (!id || typeof id !== 'string') return false;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id);
};

interface StudentData {
    full_name: string;
    student_id_number: string;
    class_id: string; // Ensure class_id is expected
    password?: string; // Allow optional password for direct creation
}

// Reusable function to create a single student
async function createSingleStudent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    studentData: StudentData,
    teacherId: string
): Promise<{ data?: any; error?: any; details?: any; status?: number }> {
    const { full_name, student_id_number, class_id, password: providedPassword } = studentData;

    // 1. Validate input
    if (!full_name || !student_id_number || !class_id) {
        return { error: { message: 'Missing required fields: full_name, student_id_number, class_id' }, status: 400 };
    }

    // 2. Check if the class belongs to the teacher using admin client
    const { data: classData, error: classError } = await supabaseAdmin
        .from('classes')
        .select('id')
        .eq('id', class_id)
        .eq('teacher_id', teacherId)
        .maybeSingle();

    if (classError) {
        console.error('Error checking class ownership:', classError);
        return { error: { message: 'Failed to verify class ownership' }, status: 500 };
    }

    if (!classData) {
        return { error: { message: 'Class not found or teacher does not own this class' }, status: 403 };
    }

    // 3. Create user in auth.users using admin client
    // Generate email and a secure random password if not provided
    const email = `${student_id_number}@qbot.student`;
    const password = providedPassword || Math.random().toString(36).slice(-8); // Generate random password if not provided

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            full_name: full_name,
            role: 'student',
            student_id_number: student_id_number,
        },
    });

    if (authError) {
        console.error('Error creating user in auth:', authError);
        // Check for specific errors like user already exists
        if (authError.message.includes('duplicate key value violates unique constraint')) {
            // Check if email is the cause (most likely)
            if (authError.message.includes('auth.users_email_key')) {
                // Try to find existing user by email to get their ID
                // @ts-ignore // Temporary ignore: Supabase admin types might be inaccurate for listUsers filter
                const { data: existingUser, error: findError } = await supabaseAdmin.auth.admin.listUsers({
                    // Supabase Admin API might support filtering, but types could be incomplete.
                    // Reverting to this approach as direct DB query caused type issues.
                    // We are assuming email filter works or listUsers returns enough data to filter client-side if needed.
                    // For robust filtering, consider server-side functions or direct DB access with proper types.
                    // filter: `email = "${email}"` // Example filter syntax if supported
                });

                // Find the user specifically by email from the list (if filter isn't exact)
                const userMatch = existingUser?.users.find(u => u.email === email);

                if (findError || !userMatch) {
                    console.error(`Find user error or user not found after duplicate key for ${email}:`, findError);
                    return { error: { message: `User with email ${email} potentially exists but couldn't be retrieved or matched.` }, details: findError || 'User not found in list', status: 409 };
                }
                const userId = userMatch.id;

                // Update profile instead of failing
                console.log(`User ${email} already exists (ID: ${userId}). Attempting to update profile...`);
                const { data: profileUpdateData, error: profileUpdateError } = await supabaseAdmin
                    .from('profiles')
                    .update({ full_name: full_name, student_id_number: student_id_number, class_id: class_id })
                    .eq('user_id', userId) // Match profile by user_id
                    .select('user_id')
                    .single();
                if (profileUpdateError) {
                    console.error(`Failed to update profile for existing user ${userId}:`, profileUpdateError);
                    return { error: { message: `User exists, but failed to update profile.` }, details: profileUpdateError, status: 500 };
                }
                console.log(`User ${email} already existed. Profile updated.`);
                // Return success but indicate it was an update
                return { data: { message: 'User already existed. Profile updated.', user_id: userId }, status: 200 };
            } else {
                // If duplicate key is not email, it might be something else unexpected
                console.error('Duplicate key error, but not email:', authError);
                return { error: { message: 'Failed to create user due to an unexpected conflict.' }, details: authError, status: 409 };
            }
        }
        return { error: { message: 'Failed to create user in authentication system' }, details: authError, status: 500 };
    }

    const userId = authData.user.id;

    // 4. Create profile in profiles table using admin client
    const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
            user_id: userId, // Link to the auth.users table via user_id FK
            full_name: full_name,
            role: 'student',
            student_id_number: student_id_number,
            class_id: class_id, // Assign class_id
            // Do NOT store password hash here
        })
        .select('user_id')
        .single();

    if (profileError) {
        console.error('Error creating profile:', profileError);
        // If profile creation fails, attempt to delete the user from auth.users to clean up
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return { error: { message: 'Failed to create student profile' }, details: profileError, status: 500 };
    }

    console.log(`Successfully created student: ${full_name} (${student_id_number}) with ID: ${profileData.user_id} and temp password: ${password}`);
    return { data: { ...profileData, email: email, password: password }, status: 201 }; // Return created profile ID, email and temp password
}

// GET: Fetch all students for the logged-in teacher
export async function GET(request: NextRequest) {
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

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Check if user is a teacher
    const { data: teacherProfile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

    if (profileError || !teacherProfile || teacherProfile.role !== 'teacher') {
        return NextResponse.json({ error: '학생 목록을 조회할 권한이 없습니다.' }, { status: 403 });
    }

    // 3. Fetch students associated with this teacher
    const { data: teacherClasses, error: classesError } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);

    if (classesError) {
        console.error('교사 클래스 조회 오류:', classesError);
        return NextResponse.json({ error: '클래스 조회 중 오류 발생' }, { status: 500 });
    }

    const classIds = teacherClasses?.map(c => c.id) || [];

    if (classIds.length === 0) {
        return NextResponse.json([]); 
    }

    const { data: students, error: studentsError } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, student_id_number, role, class_id, created_at')
        .in('class_id', classIds)
        .eq('role', 'student')
        .order('created_at', { ascending: false });

    if (studentsError) {
        console.error('학생 조회 오류:', studentsError);
        return NextResponse.json({ error: '학생 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json(students || []);
}

// POST: Create a new student (single JSON) or bulk create via CSV
export async function POST(request: NextRequest) {
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
        const { data: teacherProfile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (profileError || !teacherProfile || teacherProfile.role !== 'teacher') {
            return NextResponse.json({ error: '학생을 생성할 권한이 없습니다.' }, { status: 403 });
        }

        // 3. Differentiate between JSON and CSV upload
        const contentType = request.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            // --- Handle Single Student Creation (JSON) --- 
            let studentData: StudentData;
            try {
                const body = await request.json();
                studentData = body;
                // Basic validation
                if (!studentData.full_name || typeof studentData.full_name !== 'string' || studentData.full_name.trim().length === 0) {
                    throw new Error('학생 이름이 필요합니다.');
                }
                if (!studentData.student_id_number || typeof studentData.student_id_number !== 'string' || studentData.student_id_number.trim().length === 0) {
                    throw new Error('학번이 필요합니다.');
                }
                if (studentData.password && (typeof studentData.password !== 'string' || studentData.password.length < 6)) {
                    throw new Error('비밀번호는 6자 이상이어야 합니다.');
                }
                if (!studentData.class_id || typeof studentData.class_id !== 'string' || studentData.class_id.trim() === '') {
                    throw new Error('Missing or invalid class_id');
                }
                studentData.class_id = studentData.class_id.trim(); // Trim the class_id

                studentData.full_name = studentData.full_name.trim();
                studentData.student_id_number = studentData.student_id_number.trim();

            } catch (e: any) {
                return NextResponse.json({ error: e.message || '잘못된 요청 본문입니다.' }, { status: 400 });
            }

            // Validate class_id ownership if provided and not null
            if (studentData.class_id) {
                const { data: classData, error: classError } = await supabase
                    .from('classes')
                    .select('id')
                    .eq('id', studentData.class_id)
                    .eq('teacher_id', user.id) // Ensure the class belongs to the authenticated teacher
                    .single();

                if (classError || !classData) {
                    // If class_id is provided but invalid or doesn't belong to the teacher
                    return NextResponse.json({ error: '존재하지 않거나 접근 권한이 없는 클래스 ID입니다.' }, { status: 400 });
                }
            }

            // Use the refactored function
            const result = await createSingleStudent(supabaseAdmin, studentData, user.id);

            if (!result.error) {
                return NextResponse.json(result.data, { status: 201 });
            } else {
                // Determine appropriate status code based on error
                let statusCode = 500;
                if (result.error?.includes('클래스')) statusCode = 400;
                if (result.error?.includes('중복') || result.error?.includes('존재하는 학번')) statusCode = 409;
                return NextResponse.json({ error: result.error, details: result.details }, { status: statusCode });
            }

        } else if (contentType?.includes('multipart/form-data')) {
            // --- Handle Bulk Student Creation (CSV) --- 
            let formData;
            let file: File | null = null;
            try {
                formData = await request.formData();
                file = formData.get('studentsCsv') as File | null;
                if (!file) {
                    throw new Error("CSV 파일이 'studentsCsv' 필드에 첨부되지 않았습니다.");
                }
                if (file.type !== 'text/csv') {
                     throw new Error('파일 형식이 CSV가 아닙니다.');
                }
            } catch (e: any) {
                 return NextResponse.json({ error: e.message || '폼 데이터 처리 오류.' }, { status: 400 });
            }

            const fileContent = await file.text();
            const results: { success: boolean; data?: any; error?: string; details?: any; input?: any }[] = [];
            let successfulCreations = 0;
            let failedCreations = 0;

            // Fetch teacher's classes once for validation
            const { data: teacherClasses, error: classesError } = await supabase
                .from('classes')
                .select('id')
                .eq('teacher_id', user.id);
            if (classesError) {
                return NextResponse.json({ error: '클래스 목록 조회 실패. 업로드를 진행할 수 없습니다.' }, { status: 500 });
            }
            const teacherClassIds = new Set(teacherClasses?.map(c => c.id) || []);

            const parsePromise = new Promise<NextResponse>((resolve, reject) => {
                Papa.parse(fileContent, {
                    header: true,
                    skipEmptyLines: true,
                    error: (error: Error) => { // Handle parsing errors
                        console.error("CSV 파싱 오류:", error);
                        reject(NextResponse.json({ error: 'CSV 파일 파싱 중 오류 발생: ' + error.message }, { status: 400 }));
                    },
                    complete: (parseResult) => { // Use complete callback within options
                        if (parseResult.errors.length > 0) {
                            console.error('CSV parsing errors:', parseResult.errors);
                            // Even with errors, Papaparse might produce partial data. Decide how to handle.
                            // Option 1: Reject entirely
                            // reject(NextResponse.json({ message: 'Failed to parse CSV file', errors: parseResult.errors }, { status: 400 }));
                            // Option 2: Log errors and proceed with parsed data (might be risky)
                            console.warn("CSV parsing generated errors, but attempting to process valid rows...");
                        }

                        // Validate headers
                        const actualHeaders = parseResult.meta.fields;
                        if (!actualHeaders || !['full_name', 'student_id_number', 'class_id'].every(header => actualHeaders.includes(header))) {
                            reject(NextResponse.json({ message: `Invalid CSV headers. Expected: full_name, student_id_number, class_id. Found: ${actualHeaders?.join(', ')}` }, { status: 400 }));
                            return;
                        }

                        const csvRows = parseResult.data as { full_name?: string; student_id_number?: string; class_id?: string | null }[];

                        if (csvRows.length === 0) {
                            resolve(NextResponse.json({ message: 'CSV file is empty or contains no data rows.' }, { status: 400 }));
                            return;
                        }

                        console.log(`Processing ${csvRows.length} students from CSV...`);

                        const processingPromises: Promise<void>[] = [];

                        for (const row of csvRows) {
                            // Prepare and **validate** data for createSingleStudent
                            const studentInput = {
                                full_name: row.full_name?.trim() || '',
                                student_id_number: row.student_id_number?.trim() || '',
                                class_id: row.class_id?.trim() || '', // Trim and keep as string for validation
                            };

                            processingPromises.push((async () => {
                                // Basic validation
                                if (!studentInput.full_name || !studentInput.student_id_number || !studentInput.class_id) {
                                    failedCreations++;
                                    results.push({ success: false, error: 'Missing required fields (full_name, student_id_number, class_id)', input: row });
                                    return;
                                }

                                // Class ID validation
                                // Ensure class_id is a valid UUID and belongs to the teacher
                                if (!isUUID(studentInput.class_id)) {
                                    failedCreations++;
                                    results.push({ success: false, error: 'Invalid Class ID format (not UUID)', input: row });
                                    return;
                                } else if (!teacherClassIds.has(studentInput.class_id)) {
                                    failedCreations++;
                                    results.push({ success: false, error: 'Class ID not found or not owned by teacher', input: row });
                                    return;
                                }

                                // Now we know class_id is a valid string UUID owned by the teacher
                                const validatedStudentData: StudentData = {
                                    full_name: studentInput.full_name,
                                    student_id_number: studentInput.student_id_number,
                                    class_id: studentInput.class_id, // Pass the validated string
                                };

                                const result = await createSingleStudent(supabaseAdmin, validatedStudentData, user.id);
                                if (!result.error) { // Check for absence of error
                                    successfulCreations++;
                                    results.push({ success: true, data: result.data, input: row });
                                } else {
                                    failedCreations++;
                                    results.push({ success: false, error: result.error.message, details: result.details, input: row });
                                }
                            })());
                        }

                        Promise.all(processingPromises).then(() => { // Wait for all row processing
                            resolve(NextResponse.json({
                                message: `CSV 처리 완료. 성공: ${successfulCreations}, 실패: ${failedCreations}`,
                                results: results // Include detailed results
                            }, { status: failedCreations > 0 ? 207 : 200 })); // 207 Multi-Status if some failed
                        }); // End of Promise.all.then
                    } // End of complete callback
                }); // End of Papa.parse call
            }); // End of parsePromise definition

            return parsePromise; // Return the promise that resolves with the NextResponse

        } else {
             // Handle unsupported content type
             console.warn(`Unsupported content type received: ${contentType}`);
             return NextResponse.json({ error: `Unsupported content type: ${contentType}. Please use application/json or multipart/form-data.` }, { status: 415 });
        }

    } catch (error: any) { // Catch block now correctly follows the try block
        console.error('예상치 못한 학생 생성 오류 (POST):', error);
        return NextResponse.json({ error: '학생 생성 중 예상치 못한 서버 오류 발생: ' + error.message }, { status: 500 });
    }
}
