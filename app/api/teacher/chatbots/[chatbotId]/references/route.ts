import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getUserRole } from '@/lib/auth/get-user-role';

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
  const supabase = createServerClient<Database>( /* ... supabase client init ... */ ); // 타입 명시
  const { chatbotId } = params;

  try {
    // 1. 사용자 역할 및 ID 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = session.user.id;
    // getUserRole 함수가 user role과 student profile 정보(id, class_name 등)를 반환한다고 가정
    // 실제 getUserRole 구현에 따라 조정 필요
    const { role, profile: userProfile } = await getUserRole(supabase, userId); 

    let query = supabase
      .from('reference_files') // 실제 테이블명
      .select('*') // 필요한 컬럼만 선택하는 것이 더 좋음
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false });

    if (role === 'teacher') {
      // 교사는 모든 파일 조회 가능 (소유권 확인은 여기서 하지 않음 - 필요시 추가)
      console.log(`Teacher (${userId}) accessing references for chatbot ${chatbotId}`);
    } else if (role === 'student' && userProfile) {
      console.log(`Student (${userId}, class: ${userProfile.class_name}) accessing references for chatbot ${chatbotId}`);
      // 학생인 경우 접근 권한 확인 및 공개 파일만 필터링
      const studentClassName = userProfile.class_name;

      // 챗봇의 허용 클래스 확인
      const { data: chatbot, error: chatbotError } = await supabase
          .from('chatbots')
          .select('allowed_classes')
          .eq('id', chatbotId)
          .single();

      if (chatbotError || !chatbot) {
          console.error(`Chatbot ${chatbotId} not found for student access check:`, chatbotError);
          // 챗봇 없으면 접근 불가
          return NextResponse.json({ error: 'Chatbot not found or inaccessible' }, { status: 404 });
      }

      const isAllowed = chatbot.allowed_classes?.includes(studentClassName);
      if (!isAllowed) {
          console.warn(`Student from class ${studentClassName} denied access to references for chatbot ${chatbotId}`);
          return NextResponse.json({ error: 'Access denied to this chatbot's references for your class' }, { status: 403 });
      }

      // 접근 가능하면 is_public = true 인 파일만 조회하도록 쿼리 수정
      query = query.eq('is_public', true);

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

    // 학생에게는 storage_path 같은 민감 정보 제외하고 반환 고려
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