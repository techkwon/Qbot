import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers'; 
import { verifyTeacherRole } from '@/lib/authUtils';
import { Database } from '@/types/supabase';
import { createServerClient as createServerClientLib } from '@/lib/supabase/server';

// ConversationSummary 타입 정의
interface ConversationSummary {
  id: string;
  student_name: string;
  chatbot_name: string;
  last_message_at: string;
}

// GET 핸들러: 교사의 모든 챗봇 관련 대화 세션 목록 조회
export async function GET(request: Request) {
    const cookieStore = cookies();
    const supabase = createServerClientLib(cookieStore);

    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. 교사의 챗봇 목록 ID 가져오기 (성능상 모든 세션을 가져와 필터링하는 것보다 나을 수 있음)
        const { data: teacherChatbots, error: chatbotError } = await supabase
            .from('chatbots')
            .select('id')
            .eq('teacher_id', user.id);

        if (chatbotError) {
            console.error('Error fetching teacher chatbots:', chatbotError);
            throw chatbotError;
        }

        if (!teacherChatbots || teacherChatbots.length === 0) {
            // 교사에게 챗봇이 없는 경우 빈 목록 반환
            return NextResponse.json([], { status: 200 });
        }

        const chatbotIds = teacherChatbots.map(cb => cb.id);

        // 3. 해당 챗봇 ID들에 속하는 모든 학생 세션 조회 (학생 정보, 챗봇 이름 포함)
        const { data: sessions, error: sessionsError } = await supabase
            .from('student_sessions')
            .select(`
                id, 
                created_at, 
                start_time,
                end_time,
                student_id,
                chatbot_id,
                students ( name, student_number, class_name ),
                chatbots ( name )
            `)
            .in('chatbot_id', chatbotIds)
            .order('start_time', { ascending: false }); // 최신 세션 순서

        if (sessionsError) {
            console.error('Error fetching student sessions:', sessionsError);
            throw sessionsError;
        }

        // 4. 조회된 세션 목록 반환
        return NextResponse.json(sessions ?? [], { status: 200 });

    } catch (error) {
        console.error('Failed to fetch conversations:', error);
        return NextResponse.json({ error: 'Failed to retrieve conversations' }, { status: 500 });
    }
}

// 기본 OPTIONS 핸들러 추가 (CORS 등 필요시)
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
