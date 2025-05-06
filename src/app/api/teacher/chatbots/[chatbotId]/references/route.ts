import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyTeacherRole } from '@/lib/authUtils';
import { User } from '@supabase/supabase-js'; // Import User type

interface Params {
  params: { chatbotId: string };
}

// Common function to create Supabase client for Route Handlers
function createSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => {
          return cookieStore.get(name)?.value;
        },
        set: (name: string, value: string, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handle read-only errors
          }
        },
        remove: (name: string, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle read-only errors
          }
        },
      },
    }
  );
}

// POST 핸들러: 특정 챗봇에 참고 파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  const { chatbotId } = params;
  const supabase = createSupabaseClient();

  try {
    // 1. 사용자 인증 및 교사 역할 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    // Pass the full user object to verifyTeacherRole
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: '권한이 없습니다. 교사만 접근 가능합니다.' }, { status: 403 });
    }

    // 2. 챗봇 소유권 확인 (이 챗봇을 수정할 권한이 있는지)
    const { data: chatbotData, error: chatbotError } = await supabase
      .from('chatbots')
      .select('teacher_id')
      .eq('id', chatbotId)
      .single();

    if (chatbotError || !chatbotData) {
      console.error('Chatbot fetch error:', chatbotError);
      return NextResponse.json({ error: '챗봇을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (chatbotData.teacher_id !== user.id) {
      return NextResponse.json({ error: '이 챗봇에 파일을 업로드할 권한이 없습니다.' }, { status: 403 });
    }

    // 3. FormData에서 파일 추출
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    // public 여부도 formData에서 받을 수 있음 (선택적)
    // const isPublic = formData.get('isPublic') === 'true';

    if (!file) {
      return NextResponse.json({ error: '파일이 제공되지 않았습니다.' }, { status: 400 });
    }

    // 4. Supabase Storage에 파일 업로드
    // 저장 경로: {teacher_id}/{chatbot_id}/{uuid}_{filename}
    // UUID를 추가하여 동일 파일명 충돌 방지
    const uniqueFileName = `${crypto.randomUUID()}_${file.name}`;
    // Storage 버킷 내에서의 경로만 사용 (버킷 이름은 from()에 지정)
    const filePath = `${user.id}/${chatbotId}/${uniqueFileName}`;

    // *** 중요: 'reference-files' 버킷이 Supabase Storage에 미리 생성되어 있어야 합니다. ***
    // *** 또한, 해당 버킷에 대한 접근 정책(업로드 등)이 설정되어 있어야 합니다.  ***
    // *** RLS 정책에 따라 INSERT 권한이 있는 사용자만 업로드 가능하도록 설정 권장 ***
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reference-files') // 사용할 스토리지 버킷 이름
      .upload(filePath, file, {
        // cacheControl: '3600', // 필요시 캐시 설정
        // upsert: false // 동일 경로 파일 덮어쓰기 방지 (기본값 false)
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: '파일 업로드 실패', details: uploadError.message }, { status: 500 });
    }

    // 5. reference_files 테이블에 메타데이터 저장
    const { data: dbData, error: dbError } = await supabase
      .from('reference_files')
      .insert({
        chatbot_id: chatbotId,
        uploader_id: user.id,
        file_name: file.name, // 원본 파일명 저장
        storage_path: uploadData.path, // storage.upload()가 반환하는 경로 사용
        file_type: file.type,
        file_size: file.size,
        // is_public: isPublic ?? false, // formData에서 받았다면 해당 값 사용
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // DB 저장 실패 시 업로드된 파일 삭제 (롤백)
      await supabase.storage.from('reference-files').remove([uploadData.path]);
      return NextResponse.json({ error: '파일 정보 저장 실패', details: dbError.message }, { status: 500 });
    }

    console.log('Successfully uploaded and saved reference file:', dbData);
    return NextResponse.json(dbData, { status: 201 }); // 성공 시 저장된 메타데이터 반환

  } catch (error: any) {
    console.error('Unexpected error uploading reference file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: '서버 내부 오류 발생', details: errorMessage }, { status: 500 });
  }
}

// GET 핸들러: 특정 챗봇의 참고 파일 목록 조회
export async function GET(request: NextRequest, { params }: Params) {
  const { chatbotId } = params;
  const supabase = createSupabaseClient();

  try {
    // 1. 사용자 인증 및 교사 역할 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    // Pass the full user object to verifyTeacherRole
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: '권한이 없습니다. 교사만 접근 가능합니다.' }, { status: 403 });
    }

    // 2. 챗봇 소유권 확인 (이 챗봇을 조회할 권한이 있는지)
    const { data: chatbotData, error: chatbotError } = await supabase
      .from('chatbots')
      .select('teacher_id')
      .eq('id', chatbotId)
      .single();

    if (chatbotError || !chatbotData) {
      console.error('Chatbot fetch error:', chatbotError);
      return NextResponse.json({ error: '챗봇을 찾을 수 없습니다.' }, { status: 404 });
    }
    // 교사 본인이거나, 혹은 다른 정책 (예: is_public) 에 따라 접근 허용 로직 추가 가능
    if (chatbotData.teacher_id !== user.id) {
      // 현재는 본인 챗봇만 조회 가능하게 함
      return NextResponse.json({ error: '이 챗봇의 참고 자료를 조회할 권한이 없습니다.' }, { status: 403 });
    }

    // 3. reference_files 테이블에서 파일 목록 조회
    const { data: filesData, error: filesError } = await supabase
      .from('reference_files')
      .select('*') // 필요한 컬럼만 선택하는 것이 좋음: id, file_name, file_type, file_size, created_at
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false }); // 최신순 정렬

    if (filesError) {
      console.error('Error fetching reference files:', filesError);
      return NextResponse.json({ error: '참고 자료 목록 조회 실패', details: filesError.message }, { status: 500 });
    }

    return NextResponse.json(filesData || [], { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error fetching reference files:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: '서버 내부 오류 발생', details: errorMessage }, { status: 500 });
  }
}

// DELETE 핸들러: 특정 참고 파일 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  const { chatbotId } = params;
  const supabase = createSupabaseClient();

  try {
    // 1. 요청 본문에서 삭제할 파일 경로 가져오기
    const { filePath } = await request.json();
    if (!filePath) {
      return NextResponse.json({ error: '삭제할 파일 경로(filePath)가 필요합니다.' }, { status: 400 });
    }

    // 2. 사용자 인증 및 교사 역할 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
      return NextResponse.json({ error: '권한이 없습니다. 교사만 접근 가능합니다.' }, { status: 403 });
    }

    // 3. 파일 정보 조회 및 소유권 확인 (RLS 의존 + 추가 확인)
    const { data: fileData, error: fileFetchError } = await supabase
      .from('reference_files')
      .select('id, chatbot_id, uploaded_by')
      .eq('file_path', filePath)
      .eq('chatbot_id', chatbotId)
      .single();

    if (fileFetchError || !fileData) {
      console.error('File fetch for delete error:', fileFetchError);
      return NextResponse.json({ error: '삭제할 파일을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 });
    }

    // 4. Supabase Storage에서 파일 삭제
    const { error: storageError } = await supabase.storage
      .from('reference-files') // *** 버킷 이름 통일: chatbot_references -> reference-files ***
      .remove([filePath]);

    if (storageError) {
      if (storageError.message !== 'The resource was not found') {
          console.error('Storage delete error:', storageError);
          return NextResponse.json({ error: '스토리지에서 파일 삭제 중 오류가 발생했습니다.', details: storageError.message }, { status: 500 });
      } else {
        console.warn(`Storage file not found during deletion (path: ${filePath}), proceeding to delete DB record.`);
      }
    }

    // 5. reference_files 테이블에서 메타데이터 삭제
    const { error: dbError } = await supabase
      .from('reference_files')
      .delete()
      .eq('id', fileData.id); // 파일 ID로 삭제

    if (dbError) {
      console.error('Database delete error:', dbError);
      // 스토리지 삭제는 성공했지만 DB 삭제 실패 시 처리 필요 (예: 로깅)
      return NextResponse.json({ error: '데이터베이스에서 파일 정보 삭제 중 오류가 발생했습니다.', details: dbError.message }, { status: 500 });
    }

    console.log(`Reference file deleted successfully: ${filePath}`);
    return new NextResponse(null, { status: 204 }); // 성공 시 No Content 반환

  } catch (error) {
    console.error('DELETE /references error:', error);
    // JSON 파싱 오류 등 예외 처리
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: '서버 내부 오류 발생', details: errorMessage }, { status: 500 });
  }
}
