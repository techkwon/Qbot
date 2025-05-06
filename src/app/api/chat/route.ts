import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources';

console.log('API Route loaded'); // Log when the route module is loaded

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Message {
  id?: string; // 데이터베이스에서 자동 생성될 수 있으므로 optional
  conversation_id: string;
  content: string;
  sender_role: 'user' | 'bot';  
  created_at?: string; // 데이터베이스에서 자동 생성될 수 있으므로 optional
  metadata?: object | null; // metadata 컬럼 추가
}

export async function POST(request: NextRequest) {
  console.log('POST /api/chat received request');
  const startTime = Date.now();
  const cookieStore = cookies(); // 쿠키 스토어 가져오기

  // Supabase 클라이언트 생성 (인증 정보 확인용)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { /* ... cookie handlers ... */ } // 생략
    }
  );

  try {
    console.log('--- API 라우트 호출 시작 ---');

    // 사용자 인증 및 학생 ID 조회 (수정/추가)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const userId = session.user.id; // Supabase Auth User ID

    // 학생 프로필에서 student_id 가져오기 ('student_profiles' 테이블 가정)
    const { data: studentProfile, error: profileError } = await supabase
      .from('student_profiles') // 실제 학생 프로필 테이블명
      .select('id') // students 테이블의 PK (student_id)
      .eq('user_id', userId)
      .single();

    if (profileError || !studentProfile) {
      console.error(`Student profile not found for user ${userId}:`, profileError);
      return new Response(JSON.stringify({ error: 'Student profile not found' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const studentId = studentProfile.id; // 실제 학생 ID
    console.log(`Authenticated student: user_id=${userId}, student_id=${studentId}`);

    // Parse request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      // ... JSON 파싱 오류 처리 ...
    }

    // Destructure data - conversationId 필수화, imageUrl 추가
    const { message, conversationId, imageUrl } = requestBody as {
      message?: string;
      conversationId?: string; // 이름 변경: sessionId -> conversationId (API 내부 변수명)
      imageUrl?: string; // image 객체 대신 imageUrl 문자열 받기
    };
    const userMessageContent = message || '';

    // Validate required fields
    if (!conversationId) { // chatbotSlug 대신 conversationId 확인
      console.error('Missing conversationId in request');
      return new Response(JSON.stringify({ error: 'Missing required field: conversationId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`Request parsed: conversationId=${conversationId}, imageUrl=${imageUrl || 'none'}`);

    // 챗봇 ID 및 시스템 프롬프트 조회 (conversationId 사용)
    // 'student_sessions' 테이블과 'chatbots' 테이블 조인 또는 순차 조회 필요
    // 1. 세션 정보에서 chatbot_id 가져오기
    const { data: sessionData, error: sessionFetchError } = await supabase
        .from('student_sessions') // 실제 세션 테이블명 확인
        .select('chatbot_id')
        .eq('id', conversationId)
        // .eq('student_id', studentId) // 필요시 학생 ID로 추가 검증
        .single();

    if (sessionFetchError || !sessionData) {
        console.error(`Error fetching session ${conversationId} or session not found:`, sessionFetchError);
        return new Response(JSON.stringify({ error: 'Invalid session or session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const chatbotId = sessionData.chatbot_id;

    // 2. chatbot_id로 챗봇 정보(시스템 프롬프트, 모델) 가져오기
    const { data: chatbotData, error: chatbotFetchError } = await supabase
        .from('chatbots')
        .select('system_prompt, model')
        .eq('id', chatbotId)
        .single();

    if (chatbotFetchError || !chatbotData) {
        console.error(`Error fetching chatbot ${chatbotId}:`, chatbotFetchError);
        return new Response(JSON.stringify({ error: 'Chatbot configuration not found' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const systemPrompt = chatbotData.system_prompt || 'You are a helpful assistant. Answer in Korean.';
    const model = chatbotData.model || 'gpt-4o'; // 기본 모델 설정

    // 이전 메시지 조회 (conversationId 사용)
    const { data: previousMessages, error: messageError } = await supabase
      .from('messages') // 실제 메시지 테이블명 확인
      .select('sender, content, image_url') // role 대신 sender 가정, image_url 추가
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10); // 최근 10개 메시지 (조절 가능)

    if (messageError) {
      console.error(`Error fetching previous messages for conversation ${conversationId}:`, messageError);
      // 메시지 로드 실패 시에도 진행은 가능하도록 빈 배열로 처리
    }

    // 메시지 포맷 변환 (OpenAI 형식으로)
    const history: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(previousMessages || []).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        // TODO: 이미지 메시지 처리 보완 필요
        content: msg.sender === 'user' && msg.image_url ? 
                 [ { type: "text", text: msg.content || "" }, { type: "image_url", image_url: { url: msg.image_url } } ] : 
                 msg.content,
      } as ChatCompletionMessageParam)),
    ];

    // Construct the user message for OpenAI, potentially including image data
    const currentUserMessageContent: any[] = [{ type: 'text', text: userMessageContent }];
    if (imageUrl) {
      // Directly use the provided image URL
      currentUserMessageContent.push({ type: 'image_url', image_url: { url: imageUrl } });
      console.log(`Image URL added to OpenAI request: ${imageUrl}`);
    }
    history.push({ role: 'user', content: currentUserMessageContent });

    // OpenAI API 호출 (모델명 사용)
    const stream = await openai.chat.completions.create({
      model: model, // DB에서 가져온 모델 사용
      messages: history,
      stream: true,
      temperature: 0.7, // 필요시 조절
    });

    // 스트리밍 응답 처리
    const readableStream = new ReadableStream({
      async start(controller) {
        // ... (기존 스트리밍 로직 유지) ...
        console.log('Stream starting...');
        const encoder = new TextEncoder();
        const sendData = (data: object) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                    // Send only the delta content
                    sendData({ content: delta });
                } else if (chunk.choices[0]?.finish_reason) {
                    // Optionally send finish reason or just [DONE]
                    console.log('Stream finished with reason:', chunk.choices[0].finish_reason);
                }
            }
            // Signal end of stream
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error: any) {
            console.error('Error during OpenAI stream processing:', error);
            // Send error message through the stream
             try {
                sendData({ error: `OpenAI 처리 오류: ${error.message || '알 수 없는 오류'}` });
             } catch (sendError) {
                 console.error('Failed to send error through stream:', sendError);
             }
            controller.error(error); // Close the stream with error
        } finally {
            controller.close();
            console.log('Stream closed.');
        }
      }
    });

    // Return the stream
    // X-Conversation-Id 헤더 제거
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });

  } catch (error: any) {
    // ... (기존 에러 처리) ...
  }
}
