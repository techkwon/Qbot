import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacherRole } from '@/lib/authUtils'; // 역할 확인 유틸리티 임포트
import { z } from 'zod'; // Zod 임포트 추가
import { Database } from '@/types/supabase'; // Database 타입 임포트

// !!! SECURITY WARNING !!! Service Role Key는 환경 변수로 관리해야 합니다.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 클래스별 최대 시도 횟수 스키마
const classSettingSchema = z.object({
  class_name: z.string().min(1, '클래스 이름은 필수입니다.'),
  // max_attempts를 nullable로 변경하고 0 이상 허용 (null은 기본값 사용 의미)
  max_attempts: z.number().int().min(0, '최대 시도 횟수는 0 이상이어야 합니다.').nullable(),
});

// 챗봇 업데이트 요청 본문 스키마
const updateChatbotSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  system_prompt: z.string().optional(),
  model: z.string().optional(),
  allowed_classes: z.array(z.string()).optional(),
  max_attempts: z.number().int().min(0, '기본 사용 가능 횟수는 0 이상이어야 합니다.').optional().nullable(), // 챗봇 기본 횟수 (0 또는 null은 무제한)
  custom_link_slug: z.string().optional().refine(
    (val) => val === undefined || val === '' || /^[a-z0-9-]+$/.test(val),
    { message: '커스텀 링크는 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.' }
  ).nullable(),
  // 클래스별 설정 추가
  class_settings: z.array(classSettingSchema).optional(),
});

// --- Helper Function for Admin Client ---
// (Admin client is needed to bypass RLS for managing class settings table)
const createSupabaseAdminClient = () => {
  // Ensure service role key is available
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
  }
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Dummy cookies for admin client
      cookies: { get: () => undefined, set: () => {}, remove: () => {} },
    }
  );
};

// GET: 특정 챗봇 상세 정보 조회
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const chatbotId = params.id;
  const cookieStore = cookies(); // await 제거

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    }
  );

  try {
    // 1. 사용자 인증
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    console.log(`Authenticated user ${user.id} trying to GET chatbot ${chatbotId}`);

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden: User is not a teacher' }), { status: 403 });
    }

    // 3. 특정 챗봇 조회 (+ 클래스별 설정도 함께 조회)
    const { data: chatbot, error: fetchError } = await supabase
      .from('chatbots')
      .select(`
        *,
        chatbot_class_settings (
          class_name,
          max_attempts
        )
      `)
      .eq('id', chatbotId)
      .single();

    if (fetchError) {
      console.error(`Error fetching chatbot ${chatbotId}:`, fetchError);
      if (fetchError.code === 'PGRST116') {
           return new NextResponse(JSON.stringify({ error: 'Chatbot not found or access denied' }), { status: 404 });
      }
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch chatbot', details: fetchError.message }), { status: 500 });
    }

    if (!chatbot) {
      return new NextResponse(JSON.stringify({ error: 'Chatbot not found or access denied' }), { status: 404 });
    }

    // 4. 소유권 확인
    if (chatbot.creator_user_id !== user.id) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden: You do not own this chatbot' }), { status: 403 });
    }

    // 클래스 설정을 chatbot 객체 내 class_settings 키로 재구성 (프론트엔드 편의성)
    const formattedChatbot = {
      ...chatbot,
      class_settings: chatbot.chatbot_class_settings || [] // 관계형 데이터가 없으면 빈 배열
    };
    // 원본 관계형 데이터 삭제 (선택적)
    delete (formattedChatbot as any).chatbot_class_settings;

    return NextResponse.json(formattedChatbot);

  } catch (error: any) {
    console.error(`GET /api/teacher/chatbots/${chatbotId} Error:`, error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
  }
}

// PUT: 특정 챗봇 정보 수정
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const chatbotId = params.id;
  const cookieStore = cookies(); // await 제거

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { /* 기존 쿠키 설정 */
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    }
  );

  let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null; // Admin 클라이언트 선언

  try {
    // 1. 사용자 인증
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const teacherId = user.id; // 교사 ID 저장
    console.log(`Authenticated user ${teacherId} trying to PUT chatbot ${chatbotId}`);

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

    const validation = updateChatbotSchema.safeParse(body);
    if (!validation.success) {
      console.log("Validation Errors:", validation.error.errors);
      return new NextResponse(JSON.stringify({ error: 'Invalid request body', details: validation.error.flatten() }), { status: 400 });
    }

    const validatedData = validation.data;
    const updateChatbotData: { [key: string]: any } = {}; // chatbots 테이블 업데이트용
    const classSettingsData = validatedData.class_settings; // 클래스 설정 데이터

    // chatbots 테이블 업데이트 데이터 준비
    if (validatedData.name !== undefined) updateChatbotData.name = validatedData.name;
    if (validatedData.description !== undefined) updateChatbotData.description = validatedData.description;
    if (validatedData.system_prompt !== undefined) updateChatbotData.system_prompt = validatedData.system_prompt;
    if (validatedData.model !== undefined) updateChatbotData.model = validatedData.model;
    if (validatedData.allowed_classes !== undefined) updateChatbotData.allowed_classes = validatedData.allowed_classes;
    if (validatedData.max_attempts !== undefined) updateChatbotData.max_attempts = validatedData.max_attempts; // null 값 허용
    if (validatedData.custom_link_slug !== undefined) {
        updateChatbotData.custom_link_slug = validatedData.custom_link_slug === '' ? null : validatedData.custom_link_slug;
        // --- 커스텀 링크 중복 검사 ---
        if (updateChatbotData.custom_link_slug !== null) {
            const { data: existingSlug, error: slugCheckError } = await supabase
                .from('chatbots')
                .select('id')
                .eq('custom_link_slug', updateChatbotData.custom_link_slug)
                .neq('id', chatbotId)
                .maybeSingle();
            if (slugCheckError) throw new Error(`커스텀 링크 확인 중 오류: ${slugCheckError.message}`);
            if (existingSlug) return new NextResponse(JSON.stringify({ error: '이미 사용 중인 커스텀 링크입니다.' }), { status: 409 });
        }
        // ---------------------------
    }

    // 업데이트할 내용이 없으면 오류 (단, 클래스 설정만 변경될 수도 있음)
    if (Object.keys(updateChatbotData).length === 0 && classSettingsData === undefined) {
      return new NextResponse(JSON.stringify({ error: '업데이트할 내용이 없습니다.' }), { status: 400 });
    }

    // 4. 업데이트 전 소유권 확인
    const { data: existingChatbot, error: fetchError } = await supabase
      .from('chatbots')
      .select('creator_user_id')
      .eq('id', chatbotId)
      .single();

    if (fetchError || !existingChatbot) {
        console.error(`Error fetching chatbot ${chatbotId} for ownership check:`, fetchError);
        return new NextResponse(JSON.stringify({ error: '챗봇을 찾을 수 없거나 소유권 확인에 실패했습니다.' }), { status: fetchError?.code === 'PGRST116' ? 404 : 500 });
    }
    if (existingChatbot.creator_user_id !== teacherId) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden: You do not own this chatbot' }), { status: 403 });
    }

    // 5. 챗봇 정보 업데이트 (필요한 경우)
    let updatedChatbotResult: Database['public']['Tables']['chatbots']['Row'] | null = null;
    if (Object.keys(updateChatbotData).length > 0) {
        const { data: updatedData, error: updateError } = await supabase
            .from('chatbots')
            .update(updateChatbotData)
            .eq('id', chatbotId)
            .select() // 업데이트된 전체 데이터 반환
            .single();

        if (updateError) {
            console.error(`Error updating chatbot ${chatbotId}:`, updateError);
            if (updateError.code === '23505') { // Unique violation (e.g., custom_link_slug)
                 return new NextResponse(JSON.stringify({ error: '이미 사용 중인 커스텀 링크입니다.' }), { status: 409 });
            }
            throw new Error(`챗봇 업데이트 실패: ${updateError.message}`);
        }
        if (!updatedData) throw new Error('챗봇 업데이트 후 데이터를 찾을 수 없습니다.');
        updatedChatbotResult = updatedData;
        console.log(`Chatbot ${chatbotId} base info updated successfully.`);
    }

    // 6. 클래스별 사용 횟수 설정 업데이트 (필요한 경우)
    let finalClassSettings: Database['public']['Tables']['chatbot_class_settings']['Row'][] = [];
    if (classSettingsData !== undefined) {
        console.log(`Updating class settings for chatbot ${chatbotId}`);
        supabaseAdmin = createSupabaseAdminClient(); // Admin 클라이언트 초기화

        // 6.1. 기존 클래스 설정 삭제
        const { error: deleteError } = await supabaseAdmin
            .from('chatbot_class_settings')
            .delete()
            .eq('chatbot_id', chatbotId);

        if (deleteError) {
            console.error(`Error deleting old class settings for chatbot ${chatbotId}:`, deleteError);
            // 일단 계속 진행하고 새 설정을 삽입 시도 (Best-effort)
            // throw new Error(`기존 클래스 설정 삭제 실패: ${deleteError.message}`);
        } else {
            console.log(`Old class settings deleted for chatbot ${chatbotId}`);
        }

        // 6.2. 새로운 클래스 설정 삽입 (max_attempts가 null이 아닌 경우만)
        const settingsToInsert = classSettingsData
          .filter(setting => setting.max_attempts !== null && setting.max_attempts >= 0) // null 이거나 음수 제외
          .map(setting => ({
            chatbot_id: chatbotId,
            class_name: setting.class_name,
            max_attempts: setting.max_attempts as number, // null 체크됨
            teacher_id: teacherId, // RLS 및 소유권 확인용
          }));

        if (settingsToInsert.length > 0) {
            const { data: insertedSettings, error: insertError } = await supabaseAdmin
                .from('chatbot_class_settings')
                .insert(settingsToInsert)
                .select(); // 삽입된 데이터 반환

            if (insertError) {
                 console.error(`Error inserting new class settings for chatbot ${chatbotId}:`, insertError);
                 throw new Error(`클래스별 설정 저장 실패: ${insertError.message}`);
            }
            finalClassSettings = insertedSettings || []; // 저장된 설정 결과 저장
            console.log(`New class settings inserted for chatbot ${chatbotId}:`, finalClassSettings);
        } else {
            console.log(`No valid new class settings to insert for chatbot ${chatbotId}`);
        }
    } else {
        // 클래스 설정이 요청에 없으면, 기존 설정을 조회해서 반환 데이터에 포함
        const { data: existingSettings, error: fetchSettingsError } = await supabase
            .from('chatbot_class_settings')
            .select('class_name, max_attempts')
            .eq('chatbot_id', chatbotId);
        if (fetchSettingsError) {
            console.error("Error fetching existing class settings:", fetchSettingsError);
            // 오류 발생해도 일단 진행, 빈 배열 반환
        } else {
            finalClassSettings = existingSettings as any[] || [];
        }
    }

    // 7. 최종 결과 반환 (업데이트된 챗봇 정보 + 클래스 설정)
    // 업데이트된 챗봇 정보가 없으면 (클래스 설정만 변경된 경우) 기존 챗봇 정보를 다시 조회
    if (!updatedChatbotResult) {
        const { data: currentChatbotData, error: refetchError } = await supabase
            .from('chatbots')
            .select('*')
            .eq('id', chatbotId)
            .single();
        if (refetchError || !currentChatbotData) {
             console.error("Failed to refetch chatbot data after class settings update:", refetchError);
             // 최소한의 정보라도 반환 시도
             return NextResponse.json({ id: chatbotId, class_settings: finalClassSettings });
        }
        updatedChatbotResult = currentChatbotData;
    }

    const responsePayload = {
      ...updatedChatbotResult,
      class_settings: finalClassSettings.map(({ class_name, max_attempts }) => ({ class_name, max_attempts })) // 필요한 필드만 포함
    };

    console.log(`Chatbot ${chatbotId} update process completed successfully.`);
    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error(`PUT /api/teacher/chatbots/${chatbotId} Error:`, error);
    // Zod 에러는 위에서 처리됨
    // 중복 슬러그 에러는 위에서 처리됨
    // 기타 예상치 못한 에러
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error', details: error.message || String(error) }), { status: 500 });
  }
}

// DELETE: 특정 챗봇 삭제
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const chatbotId = params.id;
  const cookieStore = cookies(); // await 제거

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { /* 기존 쿠키 설정 */
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    }
  );

  try {
    // 1. 사용자 인증
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    console.log(`Authenticated user ${user.id} trying to DELETE chatbot ${chatbotId}`);

    // 2. 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden: User is not a teacher' }), { status: 403 });
    }

    // 3. 삭제 전 소유권 확인
    const { data: existingChatbot, error: fetchError } = await supabase
      .from('chatbots')
      .select('creator_user_id')
      .eq('id', chatbotId)
      .single();

    if (fetchError || !existingChatbot) {
      console.error(`Error fetching chatbot ${chatbotId} for delete ownership check:`, fetchError);
      return new NextResponse(JSON.stringify({ error: 'Chatbot not found or failed to check ownership' }), { status: fetchError?.code === 'PGRST116' ? 404 : 500 });
    }

    if (existingChatbot.creator_user_id !== user.id) {
      console.warn(`Unauthorized DELETE attempt on chatbot ${chatbotId} by user ${user.id}`);
      return new NextResponse(JSON.stringify({ error: 'Forbidden: You do not own this chatbot' }), { status: 403 });
    }

    // 4. 챗봇 삭제 (소유권 확인 후)
    // TODO: 관련 데이터 처리 (예: student_sessions, chat_messages 등) - CASCADE 설정 또는 수동 삭제 필요
    // chatbot_class_settings는 DB에서 ON DELETE CASCADE 설정 가정
    const { error: deleteError } = await supabase
      .from('chatbots')
      .delete()
      .eq('id', chatbotId);

    if (deleteError) {
      console.error(`Error deleting chatbot ${chatbotId}:`, deleteError);
      // Not Found 케이스 분리 (이미 삭제되었거나 권한 없음)
      if (deleteError.code === 'PGRST116') {
        return new NextResponse(JSON.stringify({ error: 'Chatbot not found or delete failed (check permissions)' }), { status: 404 });
      }
      // 참조 무결성 제약 조건 위반 등 다른 오류 처리
      return new NextResponse(JSON.stringify({ error: 'Failed to delete chatbot', details: deleteError.message }), { status: 500 });
    }

    console.log(`Chatbot ${chatbotId} deleted successfully.`);
    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error(`DELETE /api/teacher/chatbots/${chatbotId} Error:`, error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
  }
}
