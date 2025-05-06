'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import ChatInterface from './ChatInterface'

// 학생 로그인 페이지로 리디렉션하는 함수
const redirectToLogin = (router: AppRouterInstance, chatbotSlug: string) => {
  // 로그인 시 토큰을 저장한다고 가정하고, 리디렉션 전에 토큰 제거
  localStorage.removeItem('student_token'); // 예시: 로컬 스토리지 사용
  router.push(`/student/login/${chatbotSlug}`)
}

// 세션 응답 데이터 타입 정의
interface SessionResponse {
    id: string; // 세션 ID
    student_id: string;
    chatbot_id: string;
    created_at: string;
    current_attempts: number;
    max_attempts: number | null;
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null); // 세션 데이터 상태
  const [accessError, setAccessError] = useState<string | null>(null); // 접근 오류 상태

  const params = useParams<{ chatbotSlug: string }>()
  const chatbotSlug = params?.chatbotSlug as string
  const router = useRouter()
  const searchParams = useSearchParams()
  // URL에서 sessionId, studentId 가져오는 로직은 제거 (세션 시작 API로 대체)
  // const sessionId = searchParams.get('sessionId')
  // const studentId = searchParams.get('studentId')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 사용자 인증, 챗봇 ID 조회, 세션 시작 로직
  const checkAccessAndStartSession = useCallback(async () => {
    setLoading(true);
    setAccessError(null);
    setUser(null);
    setSessionData(null);

    try {
      // 1. 학생 토큰 확인 (로그인 시 저장된 토큰 사용 가정)
      const token = localStorage.getItem('student_token');
      if (!token) {
        console.log('No student token found, redirecting to login.');
        redirectToLogin(router, chatbotSlug);
        return;
      }

      // 2. 토큰으로 사용자 정보 가져오기
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user) {
        console.error('Auth error or user not found with token:', userError);
        redirectToLogin(router, chatbotSlug);
        return;
      }
      setUser(userData.user);

      // 3. 챗봇 Slug로 챗봇 ID 조회 (GET /api/chatbots/[slug])
      //    이 API는 학생 인증 없이 slug로 기본 정보(id)만 반환해야 함
      const chatbotInfoResponse = await fetch(`/api/chatbots/${chatbotSlug}`);
      if (!chatbotInfoResponse.ok) {
          const errorData = await chatbotInfoResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Chatbot info not found for slug: ${chatbotSlug}`);
      }
      const chatbotInfo: { id: string; [key: string]: any } = await chatbotInfoResponse.json();
      const chatbotId = chatbotInfo.id;
      if (!chatbotId) {
           throw new Error(`Could not retrieve Chatbot ID for slug: ${chatbotSlug}`);
      }

      // 4. 세션 시작 API 호출 (POST /api/chatbots/[chatbotId]/sessions)
      const sessionResponse = await fetch(`/api/chatbots/${chatbotId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // 인증 토큰 전달
        },
      });

      // 5. API 응답 처리
      if (sessionResponse.status === 201) {
        // 성공: 세션 데이터 저장
        const newSessionData: SessionResponse = await sessionResponse.json();
        setSessionData(newSessionData);
        console.log('Session started successfully:', newSessionData);
      } else if (sessionResponse.status === 429) {
        // 횟수 초과
        const errorData = await sessionResponse.json().catch(() => ({}));
        console.warn('Usage limit exceeded:', errorData);
        setAccessError('오늘은 더 이상 이 챗봇을 사용할 수 없습니다.'); // 사용자 친화적 메시지
      } else {
        // 기타 오류 (401, 403, 404, 500 등)
        const errorData = await sessionResponse.json().catch(() => ({}));
        console.error('Failed to start session:', sessionResponse.status, errorData);
        setAccessError(errorData.error || '챗봇에 접근할 수 없습니다. 문제가 지속되면 관리자에게 문의하세요.');
        // 특정 오류(401, 403)는 로그인 페이지로 보낼 수도 있음
        if (sessionResponse.status === 401 || sessionResponse.status === 403) {
             // 토큰이 유효하지 않거나 접근 권한이 없을 수 있으므로 로그인 페이지로
             redirectToLogin(router, chatbotSlug);
             return; // 리디렉션 후 함수 종료
        }
      }

    } catch (error: any) {
      console.error('Error during access check or session start:', error);
      setAccessError(error.message || '챗봇 로딩 중 오류가 발생했습니다.');
      // 심각한 오류 시 로그인 페이지로 보낼 수도 있음
      // redirectToLogin(router, chatbotSlug);
    } finally {
      setLoading(false);
    }
  }, [chatbotSlug, router, supabase.auth]);

  // 컴포넌트 마운트 시 접근 확인 및 세션 시작 실행
  useEffect(() => {
    checkAccessAndStartSession();
  }, [checkAccessAndStartSession]);

  // 로딩 중 UI
  if (loading) {
    return <div className="flex h-screen items-center justify-center">챗봇 로딩 중...</div>
  }

  // 접근 오류 발생 시 UI
  if (accessError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center p-4">
        <h1 className="text-xl font-semibold text-red-600 mb-4">접근 불가</h1>
        <p className="text-gray-700 mb-6">{accessError}</p>
        <button
          onClick={() => router.push('/student/login')} // 로그인 페이지 경로 확인 필요
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          로그인 페이지로 돌아가기
        </button>
      </div>
    );
  }

  // 세션 데이터가 있고 사용자가 있으면 채팅 인터페이스 렌더링
  if (sessionData && user) {
    return (
      <div className="flex h-full flex-col">
        <ChatInterface
          user={user}
          chatbotSlug={chatbotSlug}
          sessionId={sessionData.id} // API 응답에서 받은 세션 ID 사용
          studentId={sessionData.student_id} // API 응답에서 받은 학생 ID 사용
          // 사용 횟수 정보 전달
          initialCurrentAttempts={sessionData.current_attempts}
          initialMaxAttempts={sessionData.max_attempts}
        />
      </div>
    );
  }

  // 세션 데이터나 사용자 정보가 없는 경우 (오류 또는 리디렉션 직전 상태)
  // 일반적으로는 로딩 또는 에러 UI에서 처리되지만, 안전 장치로 둠
  return <div className="flex h-screen items-center justify-center">챗봇 정보를 불러오는 중 문제가 발생했습니다.</div>;
}
