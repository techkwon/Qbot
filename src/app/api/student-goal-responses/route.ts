import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase';
import { z } from 'zod';

// 단일 응답 스키마
const goalResponseSchema = z.object({
  goalId: z.string().uuid('Invalid Goal ID format'),
  checked: z.boolean(),
});

// 요청 본문 스키마 (응답 배열)
const requestBodySchema = z.object({
  chatbotId: z.string().uuid('Invalid Chatbot ID format'),
  responses: z.array(goalResponseSchema),
});

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        cookies: {
            get(name: string) { return cookieStore.get(name)?.value; },
            set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
            remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }); },
        },
    }
  );

  try {
    // 1. 학생 사용자 인증 및 ID 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
    }
    const userId = session.user.id;

    // 학생 프로필에서 student_id 가져오기
    const { data: studentProfile, error: profileError } = await supabase
      .from('student_profiles') // 실제 테이블명 확인
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !studentProfile) {
      return new NextResponse(JSON.stringify({ error: 'Student profile not found' }), { status: 403 });
    }
    const studentId = studentProfile.id;

    // 2. 요청 본문 파싱 및 유효성 검사
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new NextResponse(JSON.stringify({ error: '잘못된 요청 형식입니다.' }), { status: 400 });
    }

    const validation = requestBodySchema.safeParse(body);
    if (!validation.success) {
      return new NextResponse(JSON.stringify({ error: '잘못된 요청 데이터입니다.', details: validation.error.errors }), { status: 400 });
    }

    const { chatbotId, responses } = validation.data;

    // 3. DB에 Upsert (Insert or Update)
    // student_goal_responses 테이블 구조 가정: student_id, chatbot_id, goal_id, checked_by_student
    const recordsToUpsert = responses.map(response => ({
      student_id: studentId,
      chatbot_id: chatbotId,
      goal_id: response.goalId,
      checked_by_student: response.checked,
      // evaluated_by_ai, evaluation_comment 등은 여기서 설정하지 않음
    }));

    // onConflict 설정: student_id, chatbot_id, goal_id 가 중복될 경우 update 수행
    const { error: upsertError } = await supabase
      .from('student_goal_responses') // 실제 테이블명 확인
      .upsert(recordsToUpsert, { onConflict: 'student_id, chatbot_id, goal_id' });

    if (upsertError) {
      console.error('Error upserting student goal responses:', upsertError);
      return new NextResponse(JSON.stringify({ error: 'Failed to save responses', details: upsertError.message }), { status: 500 });
    }

    // 4. 성공 응답
    return NextResponse.json({ message: '학습 목표 응답이 성공적으로 저장되었습니다.' }, { status: 200 }); // 또는 201

  } catch (error: any) {
    console.error('POST /api/student-goal-responses Error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
} 