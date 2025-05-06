import React from 'react';
import ChatbotManagementClient from './ChatbotManagementClient'; // 클라이언트 컴포넌트 임포트
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // CookieOptions 임포트 추가
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyTeacherRole } from '@/lib/authUtils'; // 유틸리티 함수 임포트

// 교사 역할만 접근 가능하도록 하는 것이 이상적입니다.
// 현재는 로그인 여부 + 교사 역할 확인
async function checkAuthAndRole() {
  const cookieStore = await cookies(); 
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/login'); // 로그인 페이지로 리디렉션
  }

  // 유틸리티 함수를 사용하여 역할 확인
  const isTeacher = await verifyTeacherRole(supabase, user);

  if (!isTeacher) {
    console.warn(`Unauthorized access attempt by user ${user.id} to teacher page.`);
    // 교사 역할이 아니면 접근 거부 (예: 홈으로 리디렉션)
    return redirect('/');
  }

  // 교사 역할 확인 완료
  console.log(`User ${user.id} authenticated and verified as teacher for page access.`);

  // 필요 시 사용자 정보를 반환할 수 있으나, 여기서는 페이지 접근 제어만 수행
}

// 페이지 컴포넌트
export default async function TeacherChatbotsPage() {
  // 서버 컴포넌트에서 인증 및 역할 확인 수행
  await checkAuthAndRole();

  // 교사 역할이 확인된 경우에만 클라이언트 컴포넌트 렌더링
  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">챗봇 관리</h1>
      {/* 데이터 표시 및 인터랙션은 클라이언트 컴포넌트에 위임 */}
      <ChatbotManagementClient />
    </div>
  );
}
