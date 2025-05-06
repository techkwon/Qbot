'use client'

import { useState, /* useEffect, */ FormEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'

// 챗봇 정보 타입 (GET /api/chatbots/[slug] 응답 기준) - 이 페이지에서는 더 이상 사용 안 함
// interface ChatbotInfo {
//   id: string;
//   name: string;
//   description?: string | null;
//   model: string; // 필요시 추가 정보 포함
// }

// 세션 정보 타입 (POST /api/chatbots/[chatbotId]/sessions 응답 기준)
interface ChatSession {
  id: string; // 세션 ID
  chatbot_id: string; // Chatbot ID도 포함하는 것이 좋음 (URL 파싱 방지)
  // 필요한 다른 세션 정보
}

export default function StudentLoginPage() {
  const params = useParams()
  const router = useRouter()
  const chatbotSlug = params.chatbotSlug as string

  // const [chatbotInfo, setChatbotInfo] = useState<ChatbotInfo | null>(null) // 상태 제거
  // const [isLoadingChatbot, setIsLoadingChatbot] = useState(true) // 상태 제거
  const [error, setError] = useState<string | null>(null) // 로그인 관련 오류만 처리
  const [loginError, setLoginError] = useState<string | null>(null)

  const [studentNumber, setStudentNumber] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // 챗봇 정보 가져오기 useEffect 제거
  /*
  useEffect(() => {
    if (!chatbotSlug) return

    const fetchChatbotInfo = async () => {
      // ... (기존 fetch 로직 제거)
    }

    fetchChatbotInfo()
  }, [chatbotSlug])
  */

  // 로그인 폼 제출 핸들러
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    // if (!chatbotInfo?.id) return // 챗봇 정보 확인 로직 제거

    setIsLoggingIn(true)
    setLoginError(null)
    setError(null); // 이전 오류 초기화

    try {
      // 1. 학생 로그인 API 호출
      const loginResponse = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentNumber, password }),
      })

      if (!loginResponse.ok) {
        const errorData = await loginResponse.json()
        throw new Error(errorData.error || '학번 또는 비밀번호가 잘못되었습니다.')
      }

      // 로그인 성공 응답에서 session 정보 추출 (access_token 포함)
      const loginResult = await loginResponse.json();
      const session = loginResult.session;
      const accessToken = session?.access_token;
      const studentId = session?.user?.id;

      if (!accessToken || !studentId) {
        throw new Error('로그인 후 인증 정보(토큰 또는 사용자 ID)를 가져올 수 없습니다.');
      }

      try {
        sessionStorage.setItem('supabase.auth.token', accessToken);
        console.log('Auth token stored in sessionStorage.');
      } catch (storageError) {
        console.error('Failed to store auth token:', storageError);
        throw new Error('로그인 정보를 브라우저에 저장하는 데 실패했습니다.');
      }

      // 로그인 성공 -> 토큰 저장 완료

      // 2. 채팅 세션 시작 API 호출
      // !!! 중요: 세션 시작 API 호출 전에 챗봇 ID를 알아야 함 !!!
      // 챗봇 ID를 얻기 위해 /api/chatbots/[slug] 를 여기서 호출해야 함 (토큰 사용)

      let chatbotId: string | null = null;
      try {
        const chatbotInfoResponse = await fetch(`/api/chatbots/${chatbotSlug}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (!chatbotInfoResponse.ok) {
          const errorData = await chatbotInfoResponse.json();
          if (chatbotInfoResponse.status === 404) throw new Error('챗봇 정보를 찾을 수 없습니다.');
          throw new Error(errorData.error || '챗봇 정보를 가져오는 데 실패했습니다.');
        }
        const fetchedChatbotInfo : { id: string } = await chatbotInfoResponse.json();
        chatbotId = fetchedChatbotInfo.id;
      } catch(fetchError) {
        throw fetchError; // 에러 다시 던지기
      }

      if (!chatbotId) {
        throw new Error('챗봇 ID를 가져올 수 없습니다.');
      }

      const sessionResponse = await fetch(`/api/chatbots/${chatbotId}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}` // 세션 시작 API도 토큰 인증 사용 가정
        }
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json()
        if (sessionResponse.status === 429) {
          throw new Error('이 챗봇의 사용 횟수 제한을 초과했습니다.')
        }
        throw new Error(errorData.error || '채팅 세션을 시작할 수 없습니다.')
      }

      const newSession: ChatSession = await sessionResponse.json()

      // 3. 채팅 페이지로 리다이렉트 (세션 ID와 학생 ID 전달)
      router.push(`/chat/${chatbotSlug}?sessionId=${newSession.id}&studentId=${studentId}`)

    } catch (err) {
      console.error('Login or session start error:', err)
      setLoginError(err instanceof Error ? err.message : '로그인 또는 세션 시작 중 오류 발생')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // 로딩 중 또는 오류 발생 시 UI 제거
  /*
  if (isLoadingChatbot) {
    return <div className="flex justify-center items-center min-h-screen"><p>챗봇 정보 확인 중...</p></div>
  }

  if (error || !chatbotInfo) {
    return <div className="flex justify-center items-center min-h-screen"><p className="text-red-500">{error || '챗봇 정보를 불러올 수 없습니다.'}</p></div>
  }
  */

  // 로그인 폼만 표시
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">학생 로그인</h1>
        <p className="mb-4 text-center text-sm text-gray-600">챗봇: {chatbotSlug}</p>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="studentNumber" className="block text-sm font-medium text-gray-700">
              학번
            </label>
            <input
              id="studentNumber"
              name="studentNumber"
              type="text" // Use text type for student number
              autoComplete="username" // Helps some password managers
              required
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoggingIn ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </form>
        {/* Optional: Link for password reset or help */}
      </div>
    </div>
  )
}
