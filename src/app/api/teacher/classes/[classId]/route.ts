import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

// Helper function to validate UUID format
const isUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id);
};

// GET: Fetch a specific class by ID
export async function GET(request: NextRequest, { params }: { params: { classId: string } }) {
    const classId = params.classId;
    if (!isUUID(classId)) {
        return NextResponse.json({ error: '잘못된 클래스 ID 형식입니다.' }, { status: 400 });
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

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Fetch the class
    // RLS ensures only the teacher who owns the class can access it
    const { data: classData, error: fetchError } = await supabase
        .from('classes')
        .select('id, name, created_at')
        .eq('id', classId)
        .eq('teacher_id', user.id) // Double check ownership
        .single();

    if (fetchError) {
        if (fetchError.code === 'PGRST116') { // PostgREST code for 'Not Found'
            return NextResponse.json({ error: '클래스를 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 });
        }
        console.error('클래스 조회 오류:', fetchError);
        return NextResponse.json({ error: '클래스 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json(classData);
}

// PATCH: Update a class name
export async function PATCH(request: NextRequest, { params }: { params: { classId: string } }) {
    const classId = params.classId;
     if (!isUUID(classId)) {
        return NextResponse.json({ error: '잘못된 클래스 ID 형식입니다.' }, { status: 400 });
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

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Get new name from request body
     let name: string;
    try {
        const body = await request.json();
        name = body.name;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new Error('새로운 클래스 이름이 필요합니다.');
        }
        name = name.trim();
    } catch (e: any) {
        return NextResponse.json({ error: e.message || '잘못된 요청 본문입니다.' }, { status: 400 });
    }

    // 3. Update the class name
    // RLS ensures only the owner can update
    const { data: updatedClass, error: updateError } = await supabase
        .from('classes')
        .update({ name: name })
        .eq('id', classId)
        .eq('teacher_id', user.id) // Ensure ownership again
        .select('id, name, created_at')
        .single();

    if (updateError) {
         if (updateError.code === 'PGRST116') { // Not found or no rows updated
            return NextResponse.json({ error: '클래스를 찾을 수 없거나 수정 권한이 없습니다.' }, { status: 404 });
        }
        console.error('클래스 수정 오류:', updateError);
        return NextResponse.json({ error: '클래스 수정 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json(updatedClass);
}

// DELETE: Delete a class
export async function DELETE(request: NextRequest, { params }: { params: { classId: string } }) {
    const classId = params.classId;
     if (!isUUID(classId)) {
        return NextResponse.json({ error: '잘못된 클래스 ID 형식입니다.' }, { status: 400 });
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

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Delete the class
    // RLS policy restricts deletion to the owner
    const { error: deleteError, count } = await supabase
        .from('classes')
        .delete({ count: 'exact' }) // Ensure exactly one row is deleted
        .eq('id', classId)
        .eq('teacher_id', user.id); // Ensure ownership

    if (deleteError) {
        console.error('클래스 삭제 오류:', deleteError);
        return NextResponse.json({ error: '클래스 삭제 중 오류가 발생했습니다.' }, { status: 500 });
    }

    if (count === 0) {
         return NextResponse.json({ error: '클래스를 찾을 수 없거나 삭제 권한이 없습니다.' }, { status: 404 });
    }

    // On successful deletion, associated students' class_id will be set to NULL by the DB constraint
    return NextResponse.json({ message: '클래스가 성공적으로 삭제되었습니다.' }, { status: 200 });
}
