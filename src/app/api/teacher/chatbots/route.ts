import { createRouteHandlerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacherRole } from '@/lib/authUtils'; // 역할 확인 유틸리티 임포트
import { Database } from '@/types/supabase'; // Database 타입 임포트 추가
import { z } from 'zod'; // Zod 임포트 추가

// 챗봇 생성 요청 본문 스키마 (PUT 스키마와 유사하게 정의)
const createChatbotSchema = z.object({
  name: z.string().min(1, '챗봇 이름은 필수입니다.'),
  description: z.string().optional(),
  system_prompt: z.string().min(1, '시스템 프롬프트는 필수입니다.'),
  model: z.string().optional().default('gpt-4o'), // 기본값 설정
  allowed_classes: z.array(z.string()).optional().default([]), // 기본값 빈 배열
  max_attempts: z.number().int().min(0).optional().nullable().default(null), // 기본값 null (무제한)
  custom_link_slug: z.string().optional().refine(
    (val) => val === undefined || val === '' || /^[a-z0-9-]+$/.test(val),
    { message: '커스텀 링크는 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.' }
  ).nullable().default(null), // 기본값 null
});

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    // 1. 사용자 인증 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error getting user or user not found:', userError);
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    console.log(`Authenticated user ID: ${user.id}`);

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden: User is not a teacher' }), { status: 403 });
    }

    // 3. 해당 사용자가 생성한 챗봇 목록 조회
    //    (현재 스키마에는 chatbot에 user_id 필드가 없으므로 일단 모든 챗봇 조회. 추후 필드 추가 후 필터링 필요)
    //    TODO: `chatbots` 테이블에 `creator_user_id` 와 같은 필드 추가 후 아래 쿼리 수정
    const { data: chatbots, error: fetchError } = await supabase
      .from('chatbots')
      .select('*')
      // .eq('creator_user_id', user.id) // 추후 이 필터 추가
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching chatbots:', fetchError);
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch chatbots', details: fetchError.message }), { status: 500 });
    }

    console.log(`Fetched ${chatbots?.length ?? 0} chatbots.`);
    return NextResponse.json(chatbots || []);

  } catch (error: any) {
    console.error('GET /api/teacher/chatbots Error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

  try {
    // 1. 사용자 인증 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
     console.log(`Authenticated user ID for POST: ${user.id}`);

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden: User is not a teacher' }), { status: 403 });
    }

    // 3. 요청 본문 파싱 및 유효성 검사
    let body;
    try {
      body = await request.json();
    } catch (e) {
        return new NextResponse(JSON.stringify({ error: 'Invalid JSON in request body' }), { status: 400 });
    }

    const validation = createChatbotSchema.safeParse(body);
    if (!validation.success) {
        return new NextResponse(JSON.stringify({ error: 'Invalid request body', details: validation.error.errors }), { status: 400 });
    }

    const validatedData = validation.data;
    // custom_link_slug 빈 문자열 -> null 처리 (refine으로도 처리되지만 명시적)
    const customLinkSlug = validatedData.custom_link_slug?.trim() === '' ? null : validatedData.custom_link_slug?.trim() ?? null;

    // 4. 커스텀 링크 슬러그 중복 검사 (슬러그가 제공된 경우)
    if (customLinkSlug !== null) {
      const { data: existingSlug, error: slugCheckError } = await supabase
        .from('chatbots')
        .select('id')
        .eq('custom_link_slug', customLinkSlug)
        .maybeSingle(); // 생성 시에는 동일 슬러그가 없어야 함

      if (slugCheckError) {
        console.error('Error checking for existing custom link slug:', slugCheckError);
        return new NextResponse(JSON.stringify({ error: '커스텀 링크 확인 중 오류 발생', details: slugCheckError.message }), { status: 500 });
      }

      if (existingSlug) {
        return new NextResponse(JSON.stringify({ error: '이미 사용 중인 커스텀 링크입니다. 다른 링크를 사용해주세요.' }), { status: 409 }); // 409 Conflict
      }
    }

    // 5. 새 챗봇 데이터 삽입
    // creator_user_id 대신 teacher_id 사용 (ChatbotManagementClient.tsx 참고)
    const insertPayload = {
      ...validatedData,
      custom_link_slug: customLinkSlug,
      teacher_id: user.id // 교사 ID 추가 (스키마에 teacher_id 필요)
    };

    const { data: newChatbot, error: insertError } = await supabase
      .from('chatbots')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating chatbot:', insertError);
      // 중복 슬러그 에러 처리 (DB 레벨 제약 조건)
      if (insertError.code === '23505') { // PostgreSQL unique_violation code
        return new NextResponse(JSON.stringify({ error: '이미 사용 중인 커스텀 링크입니다. 다른 링크를 사용해주세요.' }), { status: 409 });
      }
      return new NextResponse(JSON.stringify({ error: 'Failed to create chatbot', details: insertError.message }), { status: 500 });
    }

    console.log('Chatbot created successfully:', newChatbot);
    return NextResponse.json(newChatbot, { status: 201 }); // 201 Created 상태 코드 반환

  } catch (error: any) {
    console.error('POST /api/teacher/chatbots Error:', error);
     if (error instanceof SyntaxError) {
        return new NextResponse(JSON.stringify({ error: 'Invalid JSON in request body' }), { status: 400 });
    }
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
  }
}
