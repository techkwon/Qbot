import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase';

// !!! 중요: Service Role Key는 환경 변수에서 안전하게 로드해야 합니다. !!!
// 이 키는 RLS를 우회하므로 노출되지 않도록 각별히 주의해야 합니다.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// 서명된 URL 만료 시간 (초 단위)
const SIGNED_URL_EXPIRES_IN = 60; // 1분

export async function GET(request: NextRequest) {
  const cookieStore = cookies();

  // 1. 사용자 인증 확인 (일반 클라이언트 사용)
  const supabase = createServerClient<Database>(
    SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        cookies: {
            get(name: string) { return cookieStore.get(name)?.value; },
            set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
            remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }); },
        },
    }
  );
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    return new NextResponse(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }
  // TODO: 필요시 사용자 역할(교사/학생) 및 파일 접근 권한 추가 검증 로직

  // 2. 요청 파라미터에서 파일 경로 가져오기
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return new NextResponse(JSON.stringify({ error: 'Missing required query parameter: path' }), { status: 400 });
  }

  // 기본적인 경로 유효성 검사 (예: ../ 등 방지) - 더 강력한 검증 필요 가능성
  if (filePath.includes('..')) {
     return new NextResponse(JSON.stringify({ error: 'Invalid file path' }), { status: 400 });
  }

  // 3. Service Role 클라이언트 생성 (서명된 URL 생성용)
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
    console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL is missing.');
    return new NextResponse(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  }

  // Service Role 키를 사용할 때는 쿠키 핸들러가 필요 없을 수 있습니다.
  // createClient 대신 Supabase JS SDK의 createClient 직접 사용 고려
  // 여기서는 createServerClient를 사용하되, 인증은 이미 위에서 확인했으므로 RLS 우회 목적
  const supabaseAdmin = createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
          cookies: {
              get(name: string) { return cookieStore.get(name)?.value; }, // 핸들러 제공 필요
              set(name: string, value: string, options: CookieOptions) { /* no-op for service role? */ },
              remove(name: string, options: CookieOptions) { /* no-op for service role? */ },
          },
      }
  );


  try {
    // 4. 서명된 URL 생성
    // 버킷 이름 확인 필요 ('reference_files' 가정)
    const { data, error } = await supabaseAdmin.storage
      .from('reference_files')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

    if (error) {
      console.error('Error creating signed URL:', error);
       // 파일 경로가 잘못되었거나 접근 권한 문제일 수 있음
      if (error.message.includes('not found')) {
           return new NextResponse(JSON.stringify({ error: 'File not found or access denied' }), { status: 404 });
      }
      return new NextResponse(JSON.stringify({ error: 'Failed to create signed URL', details: error.message }), { status: 500 });
    }

    if (!data?.signedUrl) {
        console.error('Signed URL creation succeeded but URL is missing.');
        return new NextResponse(JSON.stringify({ error: 'Failed to get signed URL' }), { status: 500 });
    }

    // 5. 서명된 URL 반환
    return NextResponse.json({ signedUrl: data.signedUrl });

  } catch (error: any) {
    console.error('GET /api/files/signed-url Error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
} 