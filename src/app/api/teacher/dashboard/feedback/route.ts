import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// TODO: Define more specific types for the aggregated data
interface DashboardData {
    chatbotStats: any[];
    goalStats: any[];
    // Add more stats as needed
}

export async function GET(request: Request) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. 교사의 챗봇 목록 ID 가져오기
        const { data: teacherChatbots, error: chatbotError } = await supabase
            .from('chatbots')
            .select('id, name')
            .eq('teacher_id', user.id);

        if (chatbotError) throw chatbotError;
        if (!teacherChatbots || teacherChatbots.length === 0) {
            return NextResponse.json({ chatbotStats: [], goalStats: [] }, { status: 200 }); // 데이터 없음
        }

        const chatbotIds = teacherChatbots.map(cb => cb.id);

        // 3. 관련 데이터 조회
        // 3.1 학생 목표 응답 데이터
        const { data: goalResponses, error: goalResponseError } = await supabase
            .from('student_goal_responses')
            .select(`
                chatbot_id,
                goal_id,
                checked_by_student,
                evaluated_by_ai,
                learning_goals ( goal_text )
            `)
            .in('chatbot_id', chatbotIds);
        if (goalResponseError) throw goalResponseError;

        // 3.2 학생 세션 데이터 (참여 수 계산 등)
        const { data: sessions, error: sessionError } = await supabase
            .from('student_sessions')
            .select('chatbot_id, student_id')
            .in('chatbot_id', chatbotIds);
        if (sessionError) throw sessionError;

        // 4. 데이터 집계 및 가공 (예시)
        const chatbotStats = teacherChatbots.map(chatbot => {
            const chatbotSessions = sessions?.filter(s => s.chatbot_id === chatbot.id) || [];
            const uniqueParticipants = new Set(chatbotSessions.map(s => s.student_id)).size;
            const totalSessions = chatbotSessions.length;

            const chatbotGoalResponses = goalResponses?.filter(gr => gr.chatbot_id === chatbot.id) || [];
            const totalGoalChecks = chatbotGoalResponses.length;
            const studentAchievedCount = chatbotGoalResponses.filter(gr => gr.checked_by_student === true).length;
            // const aiAchievedCount = chatbotGoalResponses.filter(gr => gr.evaluated_by_ai === true).length;
            const studentAchievementRate = totalGoalChecks > 0 ? (studentAchievedCount / totalGoalChecks) * 100 : 0;

            return {
                id: chatbot.id,
                name: chatbot.name,
                participantCount: uniqueParticipants,
                sessionCount: totalSessions,
                averageStudentAchievementRate: parseFloat(studentAchievementRate.toFixed(1)),
                // Add AI achievement rate if needed
            };
        });

        // 목표별 통계 (예시: 전체 챗봇 대상)
        const goalStatsMap = new Map<string, { goalText: string; total: number; achieved: number }>();
        goalResponses?.forEach(gr => {
            if (!gr.learning_goals) return;
            const goalId = gr.goal_id;
            const goalText = gr.learning_goals.goal_text;
            if (!goalStatsMap.has(goalId)) {
                goalStatsMap.set(goalId, { goalText: goalText, total: 0, achieved: 0 });
            }
            const stats = goalStatsMap.get(goalId)!;
            stats.total += 1;
            if (gr.checked_by_student === true) {
                stats.achieved += 1;
            }
        });

        const goalStats = Array.from(goalStatsMap.values()).map(stats => ({
            ...stats,
            achievementRate: stats.total > 0 ? parseFloat(((stats.achieved / stats.total) * 100).toFixed(1)) : 0,
        })).sort((a, b) => a.achievementRate - b.achievementRate); // 달성률 낮은 순 정렬


        const dashboardData: DashboardData = {
            chatbotStats,
            goalStats,
        };

        return NextResponse.json(dashboardData, { status: 200 });

    } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        return NextResponse.json({ error: 'Failed to retrieve dashboard data' }, { status: 500 });
    }
}

// 기본 OPTIONS 핸들러 추가 (CORS 등 필요시)
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
} 