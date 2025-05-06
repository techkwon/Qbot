import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 사용자 프로필 타입 정의
interface UserProfile {
  role: string | null;
  class_name: string | null;
  // 필요에 따라 다른 필드 추가
}

// 참고 파일 타입 정의
interface ReferenceFile {
  id: string;
  file_name: string;
  created_at: string;
  is_public: boolean;
  storage_path?: string; // 교사에게만 필요할 수 있음
  chatbot_id?: string; // 필요시 추가
  // 필요에 따라 다른 필드 추가
}

// 사용되지 않으므로 주석 처리 또는 제거 (여기서는 주석 처리)
/*
const fileMetadataSchema = z.object({
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  chatbotId: z.string().uuid(),
  isPublic: z.boolean().default(false),
});
*/

export async function POST(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { chatbotId } = params;

  // TODO: getUserRole 함수 구현 또는 직접 역할 확인 로직 추가 필요
  // 아래 주석 블록 삭제

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }

  const fileName = file.name;
  const storagePath = `references/${chatbotId}/${Date.now()}_${fileName}`;

  try {
    // 1. Supabase Storage에 파일 업로드
    const { error: uploadError } = await supabase.storage
      .from('reference_files')
      .upload(storagePath, file);

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: '파일 업로드 중 오류가 발생했습니다.', details: uploadError.message },
        { status: 500 }
      );
    }

    // 2. reference_files 테이블에 메타데이터 저장
    const metadataToSave = {
      file_name: fileName,
      storage_path: storagePath,
      chatbot_id: chatbotId,
      is_public: false,
    };

    // 타입 명시
    const { data: dbData, error: dbError } = await supabase
      .from('reference_files')
      .insert(metadataToSave)
      .select()
      .single<ReferenceFile>(); // 반환 타입 명시 (single()은 객체 하나 또는 null 반환)

    if (dbError) {
      console.error('DB insert error:', dbError);
      await supabase.storage.from('reference_files').remove([storagePath]);
      return NextResponse.json(
        { error: '파일 메타데이터 저장 중 오류가 발생했습니다.', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(dbData, { status: 201 }); // dbData는 ReferenceFile | null 타입

  } catch (error) {
    console.error('POST /references error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { chatbotId } = params;

  try {
    // 1. 사용자 인증 정보 가져오기
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;

    // 2. 사용자 프로필 및 역할 정보 조회 (타입 명시)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, class_name')
        .eq('id', userId)
        .single<UserProfile>(); // 반환 타입 명시

    if (profileError) {
        console.error(`Error fetching profile for user ${userId}:`, profileError);
        return NextResponse.json({ error: 'Failed to retrieve user profile' }, { status: 500 });
    }

    if (!profile) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const role = profile.role;
    const userProfile = profile;

    // 쿼리 빌더 타입 정의 (제네릭 사용)
    let queryBuilder = supabase
      .from('reference_files')
      .select<string, ReferenceFile>('id, file_name, created_at, is_public') // select 타입 명시
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false });

    if (role === 'teacher') {
      console.log(`Teacher (${userId}) accessing references for chatbot ${chatbotId}`);
      // 교사용 쿼리 (모든 컬럼)
      queryBuilder = supabase
          .from('reference_files')
          .select<string, ReferenceFile>('*') // select 타입 명시
          .eq('chatbot_id', chatbotId)
          .order('created_at', { ascending: false });

    } else if (role === 'student' && userProfile) {
      console.log(`Student (${userId}, class: ${userProfile.class_name}) accessing references for chatbot ${chatbotId}`);
      const studentClassName = userProfile.class_name;

      if (!studentClassName) {
          console.warn(`Student ${userId} profile is missing class_name.`);
          return NextResponse.json({ error: 'Student class information is missing' }, { status: 403 });
      }

      // 챗봇 정보 타입 정의 (부분적)
      interface ChatbotInfo { allowed_classes: string[] | null }
      const { data: chatbot, error: chatbotError } = await supabase
          .from('chatbots')
          .select('allowed_classes')
          .eq('id', chatbotId)
          .single<ChatbotInfo>(); // 반환 타입 명시

      if (chatbotError || !chatbot) {
          console.error(`Chatbot ${chatbotId} not found for student access check:`, chatbotError);
          return NextResponse.json({ error: 'Chatbot not found or inaccessible' }, { status: 404 });
      }

      const allowedClasses = Array.isArray(chatbot.allowed_classes) ? chatbot.allowed_classes : [];
      const isAllowed = allowedClasses.includes(studentClassName);

      if (!isAllowed) {
          console.warn(`Student from class ${studentClassName} denied access to references for chatbot ${chatbotId}`);
          return NextResponse.json({ error: "Access denied to this chatbot's references for your class" }, { status: 403 });
      }

      // 학생용 쿼리 필터 추가
      queryBuilder = queryBuilder.eq('is_public', true);

    } else {
      console.warn(`Unauthorized role (${role}) trying to access references for chatbot ${chatbotId}`);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 최종 쿼리 실행 (타입 명시)
    const { data, error } = await queryBuilder; // data 타입은 ReferenceFile[] | null

    if (error) {
      console.error('GET /references final query error:', error);
      return NextResponse.json(
        { error: '참고 자료 목록 조회 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || [], { status: 200 }); // data는 ReferenceFile[] | null 타입

  } catch (error) {
    console.error('GET /references error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 