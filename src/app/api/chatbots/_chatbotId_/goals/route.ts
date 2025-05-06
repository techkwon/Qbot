import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase';

// 필요한 타입 정의
type StudentProfile = Database['public']['Tables']['student_profiles']['Row']; // 실제 테이블명 확인
type LearningGoal = Database['public']['Tables']['learning_goals']['Row']; // 실제 테이블명 확인

export async function GET(request: NextRequest, { params }: { params: { chatbotId: string } }) {
  const { chatbotId } = params;
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
    // 1. 학생 사용자 인증
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
    }
    const userId = session.user.id;

    // 2. 학생 프로필 조회 (class_name 필요)
    const { data: studentProfile, error: profileError } = await supabase
      .from('student_profiles') // 실제 테이블명
      .select('class_name')
      .eq('user_id', userId)
      .single();

    if (profileError || !studentProfile) {
      return new NextResponse(JSON.stringify({ error: 'Student profile not found' }), { status: 403 });
    }
    const studentClassName = studentProfile.class_name;

    // 3. 챗봇 접근 권한 확인 (allowed_classes)
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      .select('allowed_classes')
      .eq('id', chatbotId)
      .single();

    if (chatbotError || !chatbot) {
      return new NextResponse(JSON.stringify({ error: 'Chatbot not found' }), { status: 404 });
    }

    const isAllowed = chatbot.allowed_classes?.includes(studentClassName);
    if (!isAllowed) {
      console.warn(`Student from class ${studentClassName} denied access to goals for chatbot ${chatbotId}`);
      return new NextResponse(JSON.stringify({ error: 'Access denied to this chatbot\'s goals for your class' }), { status: 403 });
    }

    // 4. 학습 목표 목록 조회
    // 'learning_goals' 테이블 가정, visible_to_student 필터는 현재 없음
    const { data: learningGoals, error: goalsError } = await supabase
      .from('learning_goals') // 실제 테이블명
      .select('*') // 필요시 컬럼 지정 (예: id, goal_text)
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: true }); // 생성 순서 등으로 정렬

    if (goalsError) {
      console.error(`Error fetching learning goals for chatbot ${chatbotId}:`, goalsError);
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch learning goals', details: goalsError.message }), { status: 500 });
    }

    // 5. 학습 목표 목록 반환
    return NextResponse.json(learningGoals || []);

  } catch (error: any) {
    console.error(`GET /api/chatbots/${chatbotId}/goals Error:`, error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
} 