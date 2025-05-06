import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

export async function GET(request: NextRequest) {
    const cookieStore = cookies();
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // @ts-ignore
                get: (name: string) => cookieStore.get(name)?.value,
            },
        }
    );

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Fetch classes created by this teacher
    // RLS policy ensures only the teacher's classes are returned
    const { data: classes, error: fetchError } = await supabase
        .from('classes')
        .select('id, name, created_at') // Select desired fields
        .eq('teacher_id', user.id) // Explicitly filter by teacher_id (good practice even with RLS)
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('클래스 조회 오류:', fetchError);
        return NextResponse.json({ error: '클래스를 가져오는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json(classes || []);
}

export async function POST(request: NextRequest) {
    const cookieStore = cookies();
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                 // @ts-ignore
                get: (name: string) => cookieStore.get(name)?.value,
            },
        }
    );

    // 1. Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. Check if user is a teacher (though RLS should prevent non-teachers)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

    if (profileError || !profile || profile.role !== 'teacher') {
        return NextResponse.json({ error: '클래스를 생성할 권한이 없습니다.' }, { status: 403 });
    }

    // 3. Get class name from request body
    let name: string;
    try {
        const body = await request.json();
        name = body.name;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new Error('클래스 이름이 필요합니다.');
        }
        name = name.trim(); // Trim whitespace
    } catch (e: any) {
        return NextResponse.json({ error: e.message || '잘못된 요청 본문입니다.' }, { status: 400 });
    }

    // 4. Insert the new class
    // RLS policy ensures the teacher_id matches the authenticated user
    const { data: newClass, error: insertError } = await supabase
        .from('classes')
        .insert({ name: name, teacher_id: user.id })
        .select('id, name, created_at') // Return the created class details
        .single();

    if (insertError) {
        console.error('클래스 생성 오류:', insertError);
        // Handle potential unique constraint violation or other DB errors
        if (insertError.code === '23505') { // Unique violation (though unlikely for name alone unless constraint added)
             return NextResponse.json({ error: '이미 존재하는 클래스 이름일 수 있습니다.' }, { status: 409 });
        }
        return NextResponse.json({ error: '클래스 생성 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json(newClass, { status: 201 }); // 201 Created
}
