import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyTeacherRole } from '@/lib/authUtils';
import { createClient } from '@/lib/supabase/server';

// GET 요청: 특정 ID의 학습 목표 조회
export async function GET(
  request: Request,
  { params }: { params: { goalId: string } }
) {
  const goalId = params.goalId;
  const cookieStore = cookies();
  // @ts-ignore - Workaround for TypeScript incorrectly inferring Promise type
  const supabase = createClient(cookieStore);

  try {
    // 1. 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 교사 역할 확인 (RLS 정책에서 SELECT는 authenticated만 허용하지만, API 레벨에서도 확인)
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: 'Forbidden: User is not a teacher' }, { status: 403 });
    }

    // 3. 특정 학습 목표 조회
    const { data: learningGoal, error: dbError } = await supabase
      .from('learning_goals')
      .select('id, chatbot_id, goal_text, created_at') // 필요한 필드 선택
      .eq('id', goalId)
      .single();

    if (dbError) {
      console.error(`Error fetching learning goal ${goalId}:`, dbError);
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Learning goal not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch learning goal', details: dbError.message }, { status: 500 });
    }

    // RLS 정책에서 SELECT는 소유권 확인을 하지 않으므로, 여기서 명시적으로 확인 불필요
    // (만약 교사라도 남의 목표는 못 보게 하려면 여기서 creator_user_id 확인 필요)

    return NextResponse.json(learningGoal);

  } catch (error: any) {
    console.error(`Unexpected error in GET /api/teacher/learning-goals/${goalId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// PUT 요청: 특정 ID의 학습 목표 수정
export async function PUT(
  request: Request,
  { params }: { params: { goalId: string } }
) {
  const goalId = params.goalId;
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
    const { goal_text } = await request.json();
    if (!goal_text) {
      return NextResponse.json({ error: 'Missing required field: goal_text' }, { status: 400 });
    }

    // 4. 학습 목표 업데이트 (RLS 정책이 소유권 확인)
    const { data: updatedGoal, error: updateError } = await supabase
      .from('learning_goals')
      .update({ goal_text })
      .eq('id', goalId)
      // RLS: USING (auth.uid() = creator_user_id) WITH CHECK (auth.uid() = creator_user_id)
      .select('id, chatbot_id, goal_text, created_at')
      .single();

    if (updateError) {
      console.error(`Error updating learning goal ${goalId}:`, updateError);
      // RLS 실패 시에도 오류 발생 가능 (예: 403 Forbidden 대신 500으로 나타날 수 있음)
      // 또는 id가 없는 경우
      if (updateError.code === 'PGRST116') { // Supabase는 RLS 실패 시 0 row update되어 PGRST116 발생 안 할 수 있음
         return NextResponse.json({ error: 'Learning goal not found or access denied' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to update learning goal', details: updateError.message }, { status: 500 });
    }

    // Supabase는 RLS 정책 실패 시 data가 null이고 에러가 없을 수 있음
    if (!updatedGoal) {
        return NextResponse.json({ error: 'Learning goal not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(updatedGoal);

  } catch (error: any) {
    console.error(`Unexpected error in PUT /api/teacher/learning-goals/${goalId}:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// DELETE 요청: 특정 ID의 학습 목표 삭제
export async function DELETE(
  request: Request,
  { params }: { params: { goalId: string } }
) {
  const goalId = params.goalId;
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

    // 3. 학습 목표 삭제 (RLS 정책이 소유권 확인)
    const { error: deleteError, count } = await supabase
      .from('learning_goals')
      .delete({ count: 'exact' })
      .eq('id', goalId);
      // RLS: USING (auth.uid() = creator_user_id)

    if (deleteError) {
      console.error(`Error deleting learning goal ${goalId}:`, deleteError);
      return NextResponse.json({ error: 'Failed to delete learning goal', details: deleteError.message }, { status: 500 });
    }

    // count가 0이면 해당 ID가 없거나 RLS 정책으로 인해 삭제 권한이 없는 경우
    if (count === 0) {
      return NextResponse.json({ error: 'Learning goal not found or access denied' }, { status: 404 });
    }

    // 삭제 성공 시 204 No Content 반환
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error(`Unexpected error in DELETE /api/teacher/learning-goals/${goalId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
