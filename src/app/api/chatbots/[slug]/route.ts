// TODO: Regenerate Supabase types if schema mismatch persists.
// Expected tables like 'students' and columns like 'allowed_classes' seem missing.

// import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Use standard client instead
import { createClient } from '@supabase/supabase-js'; // Import standard client
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase'; // Supabase 타입 import

// 필요한 타입 정의 (최신 스키마 반영)
type UserProfile = Database['public']['Tables']['profiles']['Row'];
// 반환 타입: system_prompt, allowed_classes 제외
type ChatbotPublicInfo = Omit<Database['public']['Tables']['chatbots']['Row'], 'system_prompt' | 'allowed_classes'>;
// DB 조회 타입: allowed_classes 포함
type ChatbotWithPermissions = Pick<Database['public']['Tables']['chatbots']['Row'], 'id' | 'name' | 'description' | 'model_config' | 'allowed_classes'>;


export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;
  // const cookieStore = cookies(); // No longer needed for auth here

  // Use standard Supabase client
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // No cookies config needed for standard client
  );

  try {
    // 1. Extract token and authenticate user via JWT
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
    const userId = user.id;

    // 2. 사용자 프로필 조회 (class_id 확인)
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      // .select('id, class_id') // Select class_id
      .select('id, class_id') // Select class_id
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      console.warn(`User profile (or class_id) potentially missing for user ${userId}. Access might be denied.`);
      // Allow proceeding but classId will be null, handled in access check
    }
    const studentClassId = userProfile?.class_id; // Get student's class ID (can be null)

    // 3. slug 로 챗봇 조회 (allowed_classes 포함)
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      // .select('id, name, description, model_config')
      .select('id, name, description, model_config, allowed_classes') // Select allowed_classes
      .eq('slug', slug)
      // .returns<ChatbotBaseInfo>()
      .returns<ChatbotWithPermissions>() // Use type with allowed_classes
      .single();

    if (chatbotError || !chatbot) {
      console.warn(`Chatbot with slug '${slug}' not found or error fetching: ${chatbotError?.message}`);
      return new NextResponse(JSON.stringify({ error: 'Chatbot not found' }), { status: 404 });
    }

    // 4. 접근 권한 확인 (allowed_classes) - 복구 및 수정
    // Check if allowed_classes is defined and studentClassId exists
    if (chatbot.allowed_classes && studentClassId) {
        if (!chatbot.allowed_classes.includes(studentClassId)) {
            console.warn(`Student with class ID '${studentClassId}' denied access to chatbot ${chatbot.id} (slug: ${slug})`);
            return new NextResponse(JSON.stringify({ error: `Access denied. This chatbot is not available for your class.` }), { status: 403 });
        }
    } else if (chatbot.allowed_classes) {
        // If chatbot has class restrictions but student has no class ID or profile issue
        console.warn(`Student ${userId} without class ID or profile denied access to restricted chatbot ${chatbot.id} (slug: ${slug})`);
        // Determine if profile missing vs class missing
        const errorMsg = !userProfile ? 'Student profile not found.' : 'Access denied. Your class information is missing.';
        return new NextResponse(JSON.stringify({ error: errorMsg }), { status: 403 });
    }
    // If chatbot.allowed_classes is null or empty, access is granted

    // 5. 접근 허용 시 챗봇 정보 반환 (system_prompt 및 allowed_classes 제외)
    const { allowed_classes, ...chatbotPublicData } = chatbot;

    return NextResponse.json(chatbotPublicData as ChatbotPublicInfo);

  } catch (error: any) {
    console.error(`GET /api/chatbots/${params.slug} Error:`, error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
} 