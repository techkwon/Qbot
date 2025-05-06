import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserRole } from '@/lib/auth/get-user-role';
import { z } from 'zod';

// PATCH 요청 본문 유효성 검사를 위한 스키마
const updateReferenceSchema = z.object({
  is_public: z.boolean(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatbotId: string; fileId: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  const { chatbotId, fileId } = params;

  // 사용자 역할 확인 (교사만 허용)
  const { role } = await getUserRole(supabase);
  if (role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 1. DB에서 파일 정보 조회 (storage_path 확인)
    const { data: fileInfo, error: fetchError } = await supabase
      .from('reference_files') // 실제 테이블 이름 확인 필요
      .select('storage_path')
      .eq('id', fileId)
      .eq('chatbot_id', chatbotId) // chatbotId도 조건에 추가하여 보안 강화
      .single();

    if (fetchError || !fileInfo) {
      console.error('Error fetching file info or file not found:', fetchError);
      return NextResponse.json(
        { error: '파일 정보를 찾을 수 없거나 조회 중 오류 발생' },
        { status: fetchError ? 500 : 404 }
      );
    }

    const { storage_path } = fileInfo;

    // 2. Storage에서 파일 삭제
    const { error: storageError } = await supabase.storage
      .from('reference_files') // 실제 버킷 이름 확인 필요
      .remove([storage_path]);

    if (storageError) {
      // 특정 오류 코드(예: 'Not Found')는 무시할 수 있음 (이미 삭제된 경우)
      if (storageError.message !== 'The resource was not found') {
        console.error('Storage delete error:', storageError);
        // DB 삭제는 시도하지 않고 오류 반환
        return NextResponse.json(
          { error: 'Storage 파일 삭제 중 오류 발생', details: storageError.message },
          { status: 500 }
        );
      }
    }

    // 3. DB에서 메타데이터 삭제
    const { error: dbError } = await supabase
      .from('reference_files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      console.error('DB delete error:', dbError);
      // Storage 삭제는 성공했지만 DB 삭제 실패 시 처리 (로깅 등)
      return NextResponse.json(
        { error: '파일 메타데이터 삭제 중 오류 발생', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: '파일이 성공적으로 삭제되었습니다.' }, { status: 200 });

  } catch (error) {
    console.error('DELETE /references/[fileId] error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { chatbotId: string; fileId: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  const { chatbotId, fileId } = params;

  // 사용자 역할 확인 (교사만 허용)
  const { role } = await getUserRole(supabase);
  if (role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = updateReferenceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: '잘못된 요청 데이터입니다.', details: validation.error.errors }, { status: 400 });
    }

    const { is_public } = validation.data;

    const { data, error } = await supabase
      .from('reference_files') // 실제 테이블 이름 확인 필요
      .update({ is_public })
      .eq('id', fileId)
      .eq('chatbot_id', chatbotId) // chatbotId 조건 추가
      .select()
      .single();

    if (error) {
      console.error('PATCH /references/[fileId] error:', error);
      if (error.code === 'PGRST116') { // PostgREST 에러 코드: No rows found
        return NextResponse.json({ error: '해당 파일을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json(
        { error: '파일 정보 업데이트 중 오류 발생', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('PATCH /references/[fileId] error:', error);
    if (error instanceof SyntaxError) { // JSON 파싱 에러 처리
        return NextResponse.json({ error: '잘못된 JSON 형식입니다.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 