// import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Use standard client
import { createClient } from '@supabase/supabase-js'; // Import standard client
// import { cookies } from 'next/headers'; // No longer needed for auth
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase'; // Supabase 타입 import

// 필요한 타입 정의 (최신 스키마 반영)
type UserProfile = Database['public']['Tables']['profiles']['Row'];
// chatbots 테이블에서 필요한 필드만 선택 (allowed_classes 추가)
type ChatbotSettings = Pick<Database['public']['Tables']['chatbots']['Row'], 'id' | 'max_attempts' | 'allowed_classes'>;
// student_sessions 타입 정의는 실제 스키마에 맞게 조정 필요 (supabase types 재생성 확인)
type StudentSession = Database['public']['Tables']['student_sessions']['Row'];

export async function POST(request: NextRequest, { params }: { params: { chatbotId: string } }) {
  const { chatbotId } = params;
  // const cookieStore = cookies(); // No longer needed

  // Use standard Supabase client
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // No cookies config needed
  );

  try {
    // 1. 학생 사용자 인증 (JWT)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];

    if (!token) {
      return new NextResponse(JSON.stringify({ error: 'Authorization token required' }), { status: 401 });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new NextResponse(JSON.stringify({ error: userError?.message || 'Invalid token' }), { status: 401 });
    }
    const userId = user.id; // This is the auth.users.id

    // 2. 학생 프로필 조회 (student_id 및 class_id 필요)
    const { data: studentProfile, error: profileError } = await supabase
      .from('profiles')
      // .select('id')
      .select('id, class_id') // Select class_id as well
      .eq('id', userId)
      .single();

    if (profileError || !studentProfile) {
      return new NextResponse(JSON.stringify({ error: 'Student profile not found for the authenticated user' }), { status: 403 });
    }
    const studentId = studentProfile.id;
    const studentClassId = studentProfile.class_id; // Get student's class ID

    // 3. 챗봇 설정 조회 (max_attempts 및 allowed_classes)
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      // .select('max_attempts')
      .select('max_attempts, allowed_classes') // Select allowed_classes as well
      .eq('id', chatbotId)
      .single<ChatbotSettings>(); // Specify return type

    if (chatbotError || !chatbot) {
      return new NextResponse(JSON.stringify({ error: 'Chatbot not found' }), { status: 404 });
    }

    // === 접근 권한 확인 (allowed_classes) - 복구 및 수정 ===
    // Check if allowed_classes is defined and studentClassId exists
    if (chatbot.allowed_classes && studentClassId) {
        // Assuming allowed_classes stores an array of class IDs (e.g., UUIDs)
        if (!chatbot.allowed_classes.includes(studentClassId)) {
            console.warn(`Student with class ID '${studentClassId}' denied access to chatbot ${chatbotId}`);
            return new NextResponse(JSON.stringify({ error: `Access denied. This chatbot is not available for your class.` }), { status: 403 });
        }
    } else if (chatbot.allowed_classes) {
        // If chatbot has class restrictions but student has no class ID
        console.warn(`Student ${studentId} without class ID denied access to restricted chatbot ${chatbotId}`);
        return new NextResponse(JSON.stringify({ error: `Access denied. Your class information is missing.` }), { status: 403 });
    }
    // If chatbot.allowed_classes is null or empty, access is granted (no class restriction)
    // ===============================================================

    // 4. 총 사용 가능 횟수 확인 (max_attempts 필드 값 사용)
    const maxAttempts = chatbot.max_attempts ?? null; // 0 또는 null 이면 무제한

    // 5. 현재 사용 횟수 확인 (총 횟수 기준)
    let currentUsageCount = 0;
    // maxAttempts가 null이 아니고 0보다 클 때만 횟수 제한 검사
    if (maxAttempts !== null && maxAttempts >= 0) { // 0도 제한으로 간주 (0번 사용 가능)
      // student_sessions 테이블 확인 (이름 및 컬럼 일치 확인 필요)
      const { count, error: countError } = await supabase
        .from('student_sessions') // 실제 세션 테이블명
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('chatbot_id', chatbotId);

      if (countError) {
        console.error('Error counting student sessions:', countError);
        return new NextResponse(JSON.stringify({ error: 'Failed to check usage count' }), { status: 500 });
      }
      currentUsageCount = count ?? 0;

      // 6. 횟수 제한 초과 확인
      if (maxAttempts === 0 || currentUsageCount >= maxAttempts) { // maxAttempts가 0이면 즉시 제한
        return new NextResponse(JSON.stringify({ error: 'Usage limit exceeded for this chatbot' }), { status: 429 });
      }
    }

    // 7. 사용 가능 -> 새 세션 생성
    // student_sessions 테이블 확인
    const { data: newSession, error: insertError } = await supabase
      .from('student_sessions')
      .insert({
        student_id: studentId,
        chatbot_id: chatbotId,
      })
      .select() // 생성된 세션 정보 반환
      .single();

    if (insertError || !newSession) {
      console.error('Error creating new student session:', insertError);
      return new NextResponse(JSON.stringify({ error: 'Failed to start new session' }), { status: 500 });
    }

    // 8. 성공 응답 (세션 정보 및 사용 횟수 정보 포함)
    return NextResponse.json({
        ...newSession,
        current_attempts: currentUsageCount + 1, // 새 세션 포함한 현재 횟수
        max_attempts: maxAttempts, // 최대 허용 횟수
    }, { status: 201 });

  } catch (error: any) {
    console.error(`POST /api/chatbots/${chatbotId}/sessions Error:`, error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
} 