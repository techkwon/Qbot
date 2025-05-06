import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Message } from 'ai'; // Vercel AI SDK의 Message 타입 사용 가능
import { format } from 'date-fns';
import ConversationViewerClient from './ConversationViewerClient'; // 클라이언트 컴포넌트 임포트

interface StudentInfo {
    id: string;
    name: string;
    student_number: string;
    class_name: string;
}

interface SessionData {
    id: string;
    chatbotId: string;
    student: StudentInfo | null;
}

interface MessageData extends Message {
    id: string;
    sender: 'student' | 'bot';
    message: string;
    image_url?: string | null;
    is_voice_input?: boolean | null;
    created_at: string;
}

async function fetchConversationData(conversationId: string): Promise<{ session: SessionData | null; messages: MessageData[] }> {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    // 인증 확인 (교사 역할 확인은 API 내부에서 수행)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Not authenticated');
        redirect('/login'); // 혹은 교사 로그인 페이지로 리디렉션
    }

    // API 호출을 서버 측에서 수행 (fetch 사용)
    // Next.js 13+에서는 서버 컴포넌트 내 fetch가 자동으로 쿠키 등을 전달
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; // 환경 변수 사용
    const apiUrl = `${baseUrl}/api/teacher/conversations/${conversationId}/messages`;

    try {
        const response = await fetch(apiUrl, {
            headers: { 'Cookie': cookieStore.toString() }, // 명시적으로 쿠키 전달 (필요시)
            cache: 'no-store', // 데이터 최신 상태 유지를 위해 캐시 사용 안 함
        });

        if (!response.ok) {
            if (response.status === 404) return { session: null, messages: [] }; // 세션 없음
            if (response.status === 403) throw new Error('Forbidden'); // 권한 없음
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }

        const data = await response.json();
        return data as { session: SessionData; messages: MessageData[] };

    } catch (error: any) {
        console.error('Error fetching conversation data:', error.message);
        if (error.message === 'Forbidden') {
             throw new Error('Forbidden'); // 에러를 다시 던져서 에러 페이지 처리 유도
        }
        // 다른 종류의 에러 처리 (예: 네트워크 오류)
        return { session: null, messages: [] }; // 또는 에러 상태 반환
    }
}

export default async function ConversationPage({ params }: { params: { conversationId: string } }) {
    let sessionData: SessionData | null = null;
    let messages: MessageData[] = [];
    let fetchError: string | null = null;
    let initialLearningGoals: any[] = []; // 학습 목표 데이터 추가
    let initialGoalResponses: any[] = []; // 기존 목표 응답 데이터 추가
    let chatbotName: string | null = null; // 챗봇 이름 추가

    const conversationId = params.conversationId;

    try {
        // 기존 대화 내용 로드
        const data = await fetchConversationData(conversationId);
        sessionData = data.session;
        messages = data.messages;

        if (sessionData) {
            // 학습 목표 및 챗봇 이름 로드 (세션 데이터에서 chatbotId 사용)
            const cookieStore = cookies(); // 함수 스코프 내에서 쿠키 다시 가져오기
            const supabase = createServerClient(cookieStore);

            const { data: goalData, error: goalError } = await supabase
                .from('learning_goals')
                .select('id, goal_text')
                .eq('chatbot_id', sessionData.chatbotId);
            if (goalError) throw new Error('Failed to fetch learning goals');
            initialLearningGoals = goalData ?? [];

            // 기존 학생 + AI 응답 로드
            const { data: responseData, error: responseError } = await supabase
                .from('student_goal_responses')
                .select('goal_id, checked_by_student, evaluated_by_ai, evaluation_comment')
                .eq('student_id', sessionData.student?.id)
                .eq('chatbot_id', sessionData.chatbotId);
             if (responseError) throw new Error('Failed to fetch goal responses');
             initialGoalResponses = responseData ?? [];

             // 챗봇 이름 로드
             const { data: chatbotInfo, error: chatbotInfoError } = await supabase
                 .from('chatbots')
                 .select('name')
                 .eq('id', sessionData.chatbotId)
                 .single();
             if (chatbotInfoError) console.warn('Could not fetch chatbot name:', chatbotInfoError.message);
             chatbotName = chatbotInfo?.name ?? null;
        }

    } catch (error: any) {
         if (error.message === 'Forbidden') {
             return <div className="p-6 text-red-500">Error: You do not have permission to view this conversation.</div>;
         } else {
             fetchError = error.message || 'Failed to load conversation data or related info.';
             console.error(fetchError, error);
         }
    }

    if (fetchError) {
        return <div className="p-6 text-red-500">Error: {fetchError}</div>;
    }

    if (!sessionData) {
        return <div className="p-6 text-gray-500">Conversation not found or could not be loaded.</div>;
    }

    // 클라이언트 컴포넌트에 필요한 데이터 전달
    return (
        <ConversationViewerClient
            conversationId={conversationId}
            initialSessionData={sessionData}
            initialMessages={messages}
            initialLearningGoals={initialLearningGoals}
            initialGoalResponses={initialGoalResponses}
            chatbotName={chatbotName}
        />
    );
}

// 예시: 권한 확인 함수 (실제 구현 필요)
// async function checkConversationPermission(supabase: any, teacherId: string, conversationId: string): Promise<boolean> {
//   // student_sessions -> chatbots (teacher_id) 조인하여 확인
//   return true; // 임시
// }

// 예시: 대화 정보 조회 함수 (실제 구현 필요)
// async function fetchConversationInfo(conversationId: string) {
//   // API 호출 또는 DB 조회
//   return { studentName: '...', chatbotName: '...' }; // 임시
// } 