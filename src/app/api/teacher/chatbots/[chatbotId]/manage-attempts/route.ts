import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const manageAttemptsSchema = z.object({
  scope: z.enum(['student', 'class', 'chatbot']),
  studentId: z.string().optional(),
  className: z.string().optional(),
}).refine(data => {
    if (data.scope === 'student' && !data.studentId) {
        return false; // studentId is always required for student scope
    }
    if (data.scope === 'class' && !data.className) {
        return false; // className is required for class scope
    }
    return true;
}, {
    message: "studentId is required for student scope. className is required for class scope.",
    path: ["studentId", "className"], // Indicate relevant fields
});


export async function POST(
    request: Request,
    { params }: { params: { chatbotId: string } }
) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);
    const { chatbotId } = params;

    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 챗봇 소유권 확인
    const { data: chatbot, error: chatbotError } = await supabase
        .from('chatbots')
        .select('id, teacher_id')
        .eq('id', chatbotId)
        .single();

    if (chatbotError || !chatbot) {
        console.error('Chatbot fetch error:', chatbotError);
        return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    if (chatbot.teacher_id !== user.id) {
        console.error('Authorization error: User does not own the chatbot');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. 요청 본문 파싱 및 유효성 검사
    let validatedData;
    try {
        const body = await request.json();
        validatedData = manageAttemptsSchema.parse(body);
    } catch (error) {
        console.error('Request body parsing/validation error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
        }
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { scope, studentId, className } = validatedData;

    try {
        // -----[ 초기화 로직 (action === 'reset' 만 남음) ]-----
        let deleteQuery = supabase
            .from('student_sessions')
            .delete()
            .eq('chatbot_id', chatbotId);

        if (scope === 'student') {
            // 특정 학생 초기화 (studentId 필수)
            deleteQuery = deleteQuery.eq('student_id', studentId!); // non-null assertion (!) 추가 (refine에서 확인됨)
            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;
            console.log(`Reset attempts for student ${studentId} on chatbot ${chatbotId}`);

        } else if (scope === 'class') {
            // 특정 클래스 초기화 (className 필수)
            const { data: students, error: studentFetchError } = await supabase
                .from('students')
                .select('id')
                .eq('teacher_id', user.id)
                .eq('class_name', className!); // non-null assertion (!) 추가

            if (studentFetchError) throw studentFetchError;

            if (students && students.length > 0) {
                const studentIds = students.map(s => s.id);
                deleteQuery = deleteQuery.in('student_id', studentIds);
                const { error: deleteError } = await deleteQuery;
                if (deleteError) throw deleteError;
                console.log(`Reset attempts for class ${className} (students: ${studentIds.join(', ')}) on chatbot ${chatbotId}`);
            } else {
                console.log(`No students found for class ${className} to reset attempts.`);
            }

        } else if (scope === 'chatbot') {
            // 챗봇 전체 학생 초기화 (해당 교사의 챗봇에 대한 모든 세션)
            // RLS가 teacher_id 기반으로 student_sessions 접근을 제한한다고 가정하거나,
            // 명시적으로 teacher_id 조건을 추가해야 할 수 있음. 여기서는 RLS 가정.
            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;
            console.log(`Reset attempts for all students (owned by teacher ${user.id}) on chatbot ${chatbotId}`);
        }

        return NextResponse.json({ message: 'Attempts reset successfully' }, { status: 200 });
        // -----[ 초기화 로직 끝 ]-----

    } catch (error: any) {
        console.error('Error resetting attempts:', error);
        // Supabase 에러 메시지를 포함하여 반환
        const message = error.message || 'Failed to reset attempts';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// 기본 OPTIONS 핸들러 추가 (CORS 등 필요시)
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
} 