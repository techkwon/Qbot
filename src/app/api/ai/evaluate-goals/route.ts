import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { z } from 'zod';

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 요청 본문 스키마 정의
const evaluateGoalsSchema = z.object({
    sessionId: z.string().uuid(), // 평가할 세션 ID
});

// 학습 목표 타입 (간단화)
interface LearningGoal {
    id: string;
    goal_text: string;
    expected_keywords?: string[] | null;
}

// AI 평가 결과 타입
interface EvaluationResult {
    goal_id: string;
    achieved: boolean;
    reason: string;
}


export async function POST(request: Request) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    console.log('POST /api/ai/evaluate-goals received request');

    try {
        // 1. 사용자 인증 확인 (교사 확인)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error('Authentication error:', authError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // TODO: 교사 역할 확인 로직 추가 (예: profiles 테이블 조회)
        console.log(`Authenticated user: ${user.id}`);


        // 2. 요청 본문 파싱 및 유효성 검사
        let validatedData;
        try {
            const body = await request.json();
            validatedData = evaluateGoalsSchema.parse(body);
        } catch (error) {
            console.error('Request body parsing/validation error:', error);
            if (error instanceof z.ZodError) {
                return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
            }
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { sessionId } = validatedData;
        console.log(`Evaluating goals for session: ${sessionId}`);

        // 3. 세션 정보 및 관련 데이터 조회
        const { data: sessionData, error: sessionError } = await supabase
            .from('student_sessions')
            .select(`
                student_id,
                chatbot_id,
                chatbots (
                    teacher_id,
                    learning_goals ( id, goal_text, expected_keywords )
                ),
                messages ( sender, message, image_url, created_at )
            `)
            .eq('id', sessionId)
            .single();

        if (sessionError || !sessionData) {
            console.error(`Session not found or error fetching session ${sessionId}:`, sessionError);
            return NextResponse.json({ error: 'Session not found or failed to fetch data' }, { status: 404 });
        }

        // 4. 챗봇 소유권 확인
        if (sessionData.chatbots?.teacher_id !== user.id) {
             console.error(`Authorization error: User ${user.id} does not own chatbot ${sessionData.chatbot_id}`);
             return NextResponse.json({ error: 'Forbidden: You do not own the chatbot associated with this session.' }, { status: 403 });
        }

        const learningGoals = sessionData.chatbots?.learning_goals as LearningGoal[] || [];
        const messages = sessionData.messages || [];
        const studentId = sessionData.student_id;
        const chatbotId = sessionData.chatbot_id;


        if (learningGoals.length === 0) {
            console.log(`No learning goals found for chatbot ${chatbotId}`);
            return NextResponse.json({ message: 'No learning goals to evaluate for this chatbot.' }, { status: 200 });
        }
        if (messages.length === 0) {
             console.log(`No messages found for session ${sessionId}`);
             return NextResponse.json({ error: 'No conversation history found to evaluate.' }, { status: 400 });
        }


        // 5. OpenAI 프롬프트 구성
        const systemPrompt = `당신은 학생과 AI 챗봇 간의 대화 내용을 보고, 주어진 학습 목표의 달성 여부를 평가하는 교육 전문가입니다. 학생의 발언 내용에 초점을 맞춰, 각 목표에 대해 학생이 충분히 이해하고 설명했는지, 관련된 핵심 키워드를 사용했는지 등을 종합적으로 판단하여 '달성(true)' 또는 '미달성(false)'으로 평가하고, 그 이유를 한국어로 간략히 설명해주세요. 평가는 학생의 답변을 기준으로 합니다.`;

        const conversationHistory = messages
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) // 시간순 정렬
            .map(msg => `${msg.sender === 'student' ? '학생' : '챗봇'}: ${msg.message}${msg.image_url ? ' (이미지 첨부)' : ''}`)
            .join('\n');

        const userPrompt = `
다음은 평가해야 할 학습 목표 목록입니다:
${learningGoals.map((goal, index) => `
목표 ${index + 1} (ID: ${goal.id}): ${goal.goal_text}
${goal.expected_keywords && goal.expected_keywords.length > 0 ? `  - 관련 키워드: ${goal.expected_keywords.join(', ')}` : ''}
`).join('')}

다음은 학생과 챗봇의 대화 내용입니다:
--- 대화 시작 ---
${conversationHistory}
--- 대화 끝 ---

위 대화 내용을 바탕으로 각 학습 목표의 달성 여부를 학생의 발언 기준으로 평가하고 이유를 설명해주세요.
반드시 다음 JSON 형식에 맞춰 각 목표별 평가 결과를 배열로 반환해주세요:
[
  {
    "goal_id": "해당 목표의 ID",
    "achieved": true 또는 false,
    "reason": "평가 이유 (한국어, 1-2문장)"
  },
  ... (다른 목표들에 대한 결과)
]
`;

        console.log("Sending request to OpenAI...");
        // console.log("System Prompt:", systemPrompt); // 필요시 로깅
        // console.log("User Prompt:", userPrompt); // 필요시 로깅

        // 6. OpenAI API 호출 (JSON 모드 사용)
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // 또는 더 적합한 모델
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' }, // JSON 모드 활성화
            temperature: 0.2, // 일관된 평가를 위해 낮은 온도 설정
        });

        const evaluationContent = response.choices[0]?.message?.content;
        if (!evaluationContent) {
            console.error('OpenAI response content is empty');
            throw new Error('Failed to get evaluation from AI');
        }

        console.log("Received OpenAI response:", evaluationContent);

        // 7. OpenAI 응답 파싱
        let evaluationResults: EvaluationResult[];
        try {
            // OpenAI 응답이 JSON 문자열을 포함하는 객체일 수 있음
             const parsedJson = JSON.parse(evaluationContent);
             // 일반적으로 JSON 모드는 루트가 객체. 결과 배열이 특정 키 아래에 있을 수 있음.
             // 프롬프트에서 명시한 배열 형식을 직접 반환하도록 유도했으므로,
             // 루트가 배열인지, 혹은 특정 키(예: 'evaluations') 아래 배열인지 확인 필요.
             if (Array.isArray(parsedJson)) {
                evaluationResults = parsedJson;
            } else if (parsedJson.evaluations && Array.isArray(parsedJson.evaluations)) {
                 evaluationResults = parsedJson.evaluations; // 예시 키
            } else {
                 // 응답 형식이 예상과 다를 경우, 응답 전체를 보고 파싱 로직 조정 필요
                 console.error("Unexpected JSON structure from OpenAI:", parsedJson);
                 throw new Error("Could not parse evaluation results from AI response.");
            }
             // 각 결과 항목의 유효성 검사 (goal_id, achieved, reason 존재 여부) 추가 가능
        } catch (parseError) {
            console.error('Error parsing OpenAI JSON response:', parseError);
            throw new Error('Failed to parse AI evaluation response');
        }

        // 8. 결과 DB 저장 (Upsert)
        const upsertData = evaluationResults.map(result => ({
            student_id: studentId,
            chatbot_id: chatbotId,
            goal_id: result.goal_id,
            evaluated_by_ai: result.achieved, // achieved 값을 evaluated_by_ai 에 저장
            evaluation_comment: result.reason, // reason 값을 evaluation_comment 에 저장
            // checked_by_student 는 건드리지 않음
        }));

        const { error: upsertError } = await supabase
            .from('student_goal_responses')
            .upsert(upsertData, {
                onConflict: 'student_id, chatbot_id, goal_id', // 충돌 기준 컬럼
                 // ignoreDuplicates: false 기본값. 충돌 시 업데이트 수행
            });

        if (upsertError) {
            console.error('Error upserting evaluation results:', upsertError);
            throw new Error('Failed to save evaluation results to database');
        }

        console.log(`Successfully evaluated and saved results for session ${sessionId}`);

        // 9. 성공 응답 반환
        return NextResponse.json({
            message: 'Learning goals evaluated successfully.',
            evaluationResults // 평가 결과를 클라이언트에게도 반환 (선택 사항)
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error in /api/ai/evaluate-goals:', error);
        return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
    }
}

// Basic OPTIONS handler
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
} 