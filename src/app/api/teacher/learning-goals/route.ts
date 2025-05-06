import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacherRole } from '@/lib/authUtils';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// GET 요청: 특정 챗봇의 학습 목표 목록 조회
export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  // @ts-ignore - Workaround for TypeScript incorrectly inferring Promise type
  const supabase = createClient(cookieStore);

  try {
    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: 'Forbidden: User is not a teacher' }, { status: 403 });
    }

    // 3. 쿼리 파라미터에서 chatbot_id 추출
    const { searchParams } = new URL(request.url);
    const chatbotId = searchParams.get('chatbot_id');

    if (!chatbotId) {
      return NextResponse.json({ error: 'Missing required query parameter: chatbot_id' }, { status: 400 });
    }

    // 4. 특정 챗봇의 학습 목표 조회
    const { data: learningGoals, error: dbError } = await supabase
      .from('learning_goals')
      .select('id, goal_text, created_at') // 필요한 필드 선택
      .eq('chatbot_id', chatbotId)
      // .eq('creator_user_id', user.id) // RLS가 SELECT는 authenticated만 허용하므로, 여기서는 필터링 안 함
      .order('created_at', { ascending: true }); // 생성 시간 순으로 정렬

    if (dbError) {
      console.error(`Error fetching learning goals for chatbot ${chatbotId}:`, dbError);
      return NextResponse.json({ error: 'Failed to fetch learning goals', details: dbError.message }, { status: 500 });
    }

    return NextResponse.json(learningGoals);

  } catch (error: any) {
    console.error('Unexpected error in GET /api/teacher/learning-goals:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// POST 요청: 새 학습 목표 생성
export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  // @ts-ignore - Workaround for TypeScript incorrectly inferring Promise type
  const supabase = createClient(cookieStore);

  try {
    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: 'Forbidden: User is not a teacher' }, { status: 403 });
    }

    // 3. 요청 본문 파싱 및 유효성 검사
    const { chatbot_id, goal_text } = await request.json();

    if (!chatbot_id || !goal_text) {
      return NextResponse.json({ error: 'Missing required fields: chatbot_id, goal_text' }, { status: 400 });
    }

    // TODO: 해당 chatbot_id가 실제로 존재하고, 요청한 교사가 소유한 챗봇인지 확인하는 로직 추가 (선택 사항이지만 권장)
    // const { data: chatbotOwner, error: ownerCheckError } = await supabase
    //   .from('chatbots')
    //   .select('creator_user_id')
    //   .eq('id', chatbot_id)
    //   .single();
    // if (ownerCheckError || !chatbotOwner || chatbotOwner.creator_user_id !== user.id) {
    //     return NextResponse.json({ error: 'Forbidden: Chatbot not found or you do not own it' }, { status: 403 });
    // }

    // 4. 새 학습 목표 데이터 삽입 (creator_user_id 포함)
    const { data: newLearningGoal, error: insertError } = await supabase
      .from('learning_goals')
      .insert({
        chatbot_id,
        goal_text,
        creator_user_id: user.id // 생성자 ID 저장
      })
      .select('id, chatbot_id, goal_text, created_at') // 삽입된 데이터 반환
      .single(); // 단일 객체로 반환

    if (insertError) {
      console.error('Error creating learning goal:', insertError);
      // 오류 유형에 따라 더 구체적인 상태 코드 반환 가능
      return NextResponse.json({ error: 'Failed to create learning goal', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newLearningGoal, { status: 201 }); // 생성 성공 시 201 Created

  } catch (error: any) {
    console.error('Unexpected error in POST /api/teacher/learning-goals:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
