import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Zod 스키마 정의 (파일 메타데이터)
const fileMetadataSchema = z.object({
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  chatbotId: z.string().uuid(),
  isPublic: z.boolean().default(false), // 기본값은 비공개
});

export async function POST(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  const { chatbotId } = params;

  // 사용자 역할 확인 (교사만 허용)
  const { role } = await getUserRole(supabase);
  if (role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
  }

  const fileName = file.name;
  const storagePath = `references/${chatbotId}/${Date.now()}_${fileName}`; // 고유 경로 생성

  try {
    // 1. Supabase Storage에 파일 업로드
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reference_files') // Supabase 버킷 이름 (실제 버킷 이름으로 변경 필요)
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
      is_public: false, // 기본값 비공개
    };

    // reference_files 테이블이 있고 컬럼명이 일치한다고 가정
    const { data: dbData, error: dbError } = await supabase
      .from('reference_files')
      .insert(metadataToSave)
      .select()
      .single();

    if (dbError) {
      console.error('DB insert error:', dbError);
      // Storage에 업로드된 파일 롤백 (선택적)
      await supabase.storage.from('reference_files').remove([storagePath]);
      return NextResponse.json(
        { error: '파일 메타데이터 저장 중 오류가 발생했습니다.', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(dbData, { status: 201 });

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
  const supabase = createServerClient(cookieStore);
  const { chatbotId } = params;

  try {
    // 1. 사용자 인증 정보 가져오기
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;

    // 2. 사용자 프로필 및 역할 정보 조회
    const { data: profile, error: profileError } = await supabase
        .from('profiles') // 실제 프로필 테이블 이름 확인 필요
        .select('role, class_name') // 필요한 컬럼 명시
        .eq('id', userId)
        .single();

    if (profileError) {
        console.error(`Error fetching profile for user ${userId}:`, profileError);
        // 프로필 조회 실패 시 접근 불가 처리
        return NextResponse.json({ error: 'Failed to retrieve user profile' }, { status: 500 });
    }

    if (!profile) {
        // 프로필이 없는 경우 (이론적으로는 발생하기 어려움)
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const role = profile.role; // 사용자 역할
    const userProfile = profile; // 프로필 정보 (class_name 포함 가능)

    let query = supabase
      .from('reference_files') // 실제 테이블명
      .select('id, file_name, created_at, is_public') // 필요한 컬럼만 선택 (storage_path 등 민감 정보 제외 고려)
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false });

    if (role === 'teacher') {
      // 교사는 모든 파일 조회 가능 (소유권 확인은 여기서 하지 않음 - 필요시 추가)
      console.log(`Teacher (${userId}) accessing references for chatbot ${chatbotId}`);
      // 교사에게는 모든 컬럼 반환 가능하도록 재정의 (선택 사항)
      query = supabase
          .from('reference_files')
          .select('*')
          .eq('chatbot_id', chatbotId)
          .order('created_at', { ascending: false });

    } else if (role === 'student' && userProfile) {
      console.log(`Student (${userId}, class: ${userProfile.class_name}) accessing references for chatbot ${chatbotId}`);
      // 학생인 경우 접근 권한 확인 및 공개 파일만 필터링
      const studentClassName = userProfile.class_name;

      if (!studentClassName) {
          // 학생 프로필에 class_name이 없는 경우 처리
          console.warn(`Student ${userId} profile is missing class_name.`);
          return NextResponse.json({ error: 'Student class information is missing' }, { status: 403 });
      }

      // 챗봇의 허용 클래스 확인
      const { data: chatbot, error: chatbotError } = await supabase
          .from('chatbots') // 실제 챗봇 테이블 이름 확인 필요
          .select('allowed_classes')
          .eq('id', chatbotId)
          .single();

      if (chatbotError || !chatbot) {
          console.error(`Chatbot ${chatbotId} not found for student access check:`, chatbotError);
          // 챗봇 없으면 접근 불가
          return NextResponse.json({ error: 'Chatbot not found or inaccessible' }, { status: 404 });
      }

      // allowed_classes가 null/undefined 이거나 배열이 아닐 수 있으므로 안전하게 처리
      const allowedClasses = Array.isArray(chatbot.allowed_classes) ? chatbot.allowed_classes : [];
      const isAllowed = allowedClasses.includes(studentClassName);

      if (!isAllowed) {
          console.warn(`Student from class ${studentClassName} denied access to references for chatbot ${chatbotId}`);
          // 여기서 문법 오류가 발생했을 가능성? --> 코드는 정상으로 보임
          return NextResponse.json({ error: "Access denied to this chatbot's references for your class" }, { status: 403 });
      }

      // 접근 가능하면 is_public = true 인 파일만 조회하도록 쿼리 수정 (기본 쿼리에서 이미 처리됨)
      query = query.eq('is_public', true); // 학생용 기본 쿼리로 is_public 필터링

    } else {
      // 교사 또는 학생이 아닌 경우 접근 불가
      console.warn(`Unauthorized role (${role}) trying to access references for chatbot ${chatbotId}`);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 최종 쿼리 실행
    const { data, error } = await query;

    if (error) {
      console.error('GET /references final query error:', error);
      return NextResponse.json(
        { error: '참고 자료 목록 조회 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      );
    }

    // 학생에게는 storage_path 같은 민감 정보 제외하고 반환 (select에서 이미 처리됨)
    // if (role === 'student') { data = data.map(({ storage_path, ...rest }) => rest); }

    return NextResponse.json(data || [], { status: 200 });

  } catch (error) {
    console.error('GET /references error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 