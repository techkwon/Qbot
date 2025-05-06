import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyTeacherRole } from '@/lib/authUtils';
import { Database } from '@/types/supabase';

interface Params {
  conversationId: string;
}

// GET 핸들러: 특정 대화의 메시지 목록 조회
export async function GET(
    request: Request,
    { params }: { params: { conversationId: string } }
) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);
    const { conversationId } = params; // This is the student_session ID

    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. 대화 세션 정보와 챗봇 소유권 확인
        const { data: sessionData, error: sessionError } = await supabase
            .from('student_sessions')
            .select(`
                id,
                chatbot_id,
                chatbots ( teacher_id ),
                student_id,
                students ( name, student_number, class_name )
            `)
            .eq('id', conversationId)
            .single();

        if (sessionError) {
            console.error('Error fetching session data:', sessionError);
            if (sessionError.code === 'PGRST116') { // Not found
                 return NextResponse.json({ error: 'Conversation session not found' }, { status: 404 });
            }
            throw sessionError;
        }

        if (!sessionData || !sessionData.chatbots) {
             console.error('Session data or related chatbot data is missing');
             return NextResponse.json({ error: 'Conversation or associated chatbot not found' }, { status: 404 });
        }

        // 교사가 해당 챗봇의 소유자인지 확인
        if (sessionData.chatbots.teacher_id !== user.id) {
            console.error('Authorization error: Teacher does not own the chatbot associated with this session');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. 해당 세션의 메시지 조회
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('id, sender, message, image_url, is_voice_input, created_at')
            .eq('session_id', conversationId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            console.error('Error fetching messages:', messagesError);
            throw messagesError;
        }

        // 4. 필요한 정보와 함께 메시지 반환
        return NextResponse.json({
            session: {
                id: sessionData.id,
                chatbotId: sessionData.chatbot_id,
                student: sessionData.students // 학생 정보 포함
            },
            messages: messages ?? [],
        }, { status: 200 });

    } catch (error) {
        console.error('Failed to fetch conversation messages:', error);
        return NextResponse.json({ error: 'Failed to retrieve conversation messages' }, { status: 500 });
    }
}

// 기본 OPTIONS 핸들러 추가 (CORS 등 필요시)
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
