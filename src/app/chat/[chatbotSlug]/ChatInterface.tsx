import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon, XMarkIcon, MicrophoneIcon, InformationCircleIcon, BookOpenIcon, ClipboardDocumentCheckIcon, PhotoIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { BeatLoader } from 'react-spinners';
import Image from 'next/image';
import { createBrowserClient } from '@supabase/ssr'; // SSR용 브라우저 클라이언트
import { v4 as uuidv4 } from 'uuid'; // UUID 생성
import type { User } from '@supabase/supabase-js'; // Import User type
// import { toast } from 'sonner'; // 임시 주석 처리 (설치 필요)
import { Checkbox } from "@/components/ui/checkbox"; // Checkbox만 유지 (설치 가정)
import { Label } from "@/components/ui/label"; // Label만 유지 (설치 가정)
// import type { CheckedState } from "@radix-ui/react-checkbox" // 임시 주석 처리 (설치 필요)
type CheckedState = boolean | 'indeterminate'; // 임시 타입 정의

// 메시지 타입 정의
interface Message {
  id: string; // 고유 ID 추가 (key prop 용)
  text: string;
  sender: 'user' | 'bot';
  isStreaming?: boolean; // 스트리밍 중인지 여부
  imageUrl?: string | null | undefined; // 이미지 URL 추가 (null 또는 undefined 허용)
}

// 참고 자료 파일 타입 (API 응답 기준)
interface ReferenceMaterial {
  id: string;
  file_name: string;
  // is_public: boolean; // 클라이언트에서는 이미 필터링됨
  // 필요한 다른 필드 (예: 파일 타입 아이콘 표시용)
  storage_path: string; // 파일 열기를 위해 임시로 포함 (서명된 URL 필요)
}

// 학습 목표 타입 (학생 응답 및 AI 평가 결과 포함하도록 수정)
interface LearningGoal {
  id: string;
  chatbot_id: string;
  goal_text: string;
  student_response?: { // 학생의 해당 목표에 대한 응답 및 평가 결과
    checked_by_student: boolean | null;
    evaluated_by_ai: boolean | null; // AI 평가 완료 여부
    evaluation_comment: string | null; // AI 평가 코멘트
  } | null;
}

// 학생 응답 상태 타입 (더 이상 별도로 필요 없을 수 있음, LearningGoal에 통합)
// interface GoalResponse { ... }

interface ChatInterfaceProps {
  chatbotSlug: string;
  user: User | null; // 사용자 정보 - User 타입 사용 (Auth ID 확인 등에 필요할 수 있음)
  sessionId: string | null; // sessionId prop 추가 (null 허용? ChatPage에서 확인하므로 필수?)
  studentId: string | null; // studentId prop 추가
  // 사용 횟수 정보 추가
  initialCurrentAttempts: number;
  initialMaxAttempts: number | null;
}

// 디버깅 로그 개선
console.log('ChatInterface loaded');

// Web Speech API 타입 정의 (브라우저 환경에서만 유효)
interface IWindow extends Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}
declare var window: IWindow;

const ChatInterface: React.FC<ChatInterfaceProps> = ({ chatbotSlug, user, sessionId, studentId, initialCurrentAttempts, initialMaxAttempts }) => {
  console.log('ChatInterface rendered with:', { chatbotSlug, user, sessionId, studentId, initialCurrentAttempts, initialMaxAttempts });

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicReady, setIsMicReady] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceMaterial[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [chatbotIdForReferences, setChatbotIdForReferences] = useState<string | null>(null);
  const referenceModalRef = useRef<HTMLDialogElement>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [learningGoals, setLearningGoals] = useState<LearningGoal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isSubmittingGoals, setIsSubmittingGoals] = useState(false);
  const [currentAttempts, setCurrentAttempts] = useState<number>(initialCurrentAttempts);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(initialMaxAttempts);
  const goalModalRef = useRef<HTMLDialogElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 메시지 목록 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 텍스트 영역 높이 자동 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // 높이 초기화
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  // 이미지 선택 및 업로드 핸들러 (수정)
  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 기존 선택 초기화
    removeSelectedImage();

    if (!file.type.startsWith('image/')) {
      // toast.error('이미지 파일만 업로드할 수 있습니다.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 파일 크기 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) {
         // toast.error('이미지 파일 크기는 5MB를 초과할 수 없습니다.');
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
    }

    setSelectedFile(file);
    const previewUrl = URL.createObjectURL(file); // 로컬 미리보기 URL 생성
    setImagePreviewUrl(previewUrl);
    setIsUploadingImage(true);
    setUploadError(null);

    // /api/upload 호출
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Image upload failed');
      }

      setUploadedImageUrl(result.imageUrl); // 업로드 성공 시 URL 저장
      // toast.success('Image uploaded successfully!');
      console.log('Image uploaded:', result.imageUrl);

    } catch (error: any) {
      console.error("Error uploading file:", error);
      setUploadError(error.message || 'Upload failed');
      // toast.error(`Image upload failed: ${error.message}`);
      // 업로드 실패 시 미리보기와 파일 상태 유지 (재시도 또는 제거 가능하도록)
      // 혹은 여기서 removeSelectedImage() 호출하여 완전히 초기화
    } finally {
      setIsUploadingImage(false);
      // 파일 입력 초기화 (같은 파일 다시 선택 가능하도록)
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 선택된 이미지 제거 핸들러 (수정)
  const removeSelectedImage = () => {
    setSelectedFile(null);
    if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl); // 메모리 누수 방지
    }
    setImagePreviewUrl(null);
    setUploadedImageUrl(null);
    setIsUploadingImage(false);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    console.log('Selected image and related states removed.');
  };

  // 이미지 업로드 버튼 클릭 핸들러 (변경 없음)
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Web Speech API 지원 확인 (클라이언트 측에서만 실행)
  useEffect(() => {
    console.log('STT useEffect 실행됨');
    if (typeof window !== 'undefined') {
      console.log('window 객체 존재 확인');
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        console.log('SpeechRecognition API 찾음:', SpeechRecognition);
        try {
          recognitionRef.current = new SpeechRecognition();
          console.log('SpeechRecognition 인스턴스 생성 성공:', recognitionRef.current);
          recognitionRef.current.lang = 'ko-KR';
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;

          recognitionRef.current.onresult = (event: any) => {
            console.log('handleRecognitionResult 호출됨, event.results:', event.results);
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
              const segment = event.results[i];
              console.log(`Result[${i}]: isFinal=${segment.isFinal}, transcript='${segment[0].transcript}'`);
              fullTranscript += segment[0].transcript;
            }
            console.log('음성 인식 현재 fullTranscript:', fullTranscript);
            setInputMessage(fullTranscript);
            console.log('setInputMessage 호출 후 (fullTranscript)');
          };

          recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            setError(`음성 인식 오류: ${event.error}`);
            setIsRecording(false);
            console.log('STT onerror: 상태 false로 변경');
          };

          recognitionRef.current.onend = () => {
            console.log('Speech recognition ended.');
            setIsRecording(false);
            console.log('STT onend: 상태 false로 변경');
          };

          console.log('SpeechRecognition 이벤트 리스너 설정 완료');
          setIsMicReady(true);
        } catch (e) {
          console.error('SpeechRecognition 인스턴스 생성 중 오류:', e);
          setError('Speech Recognition 초기화 중 오류 발생');
          setIsMicReady(false);
        }
      } else {
        console.warn('이 브라우저는 Web Speech API를 지원하지 않습니다.');
        setError('음성 인식이 지원되지 않는 브라우저입니다.');
        setIsMicReady(false);
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleMicClick = () => {
    console.log('handleMicClick 호출됨');
    console.log('현재 isRecording 상태:', isRecording);
    console.log('recognitionRef.current:', recognitionRef.current);

    if (!recognitionRef.current) {
      setError('음성 인식이 지원되지 않는 브라우저입니다.');
      console.log('handleMicClick: recognitionRef.current 없음, 종료');
      return;
    }

    if (isRecording) {
      console.log('handleMicClick: 녹음 중지 시도');
      recognitionRef.current.stop();
      console.log('음성 녹음 중지됨 (사용자 요청)');
    } else {
      console.log('handleMicClick: 녹음 시작 시도');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        console.log('handleMicClick: 녹음 시작됨, 상태 true로 변경');
        setError(null);
        console.log('음성 녹음 시작됨...');
      } catch (err) {
        console.error('Error starting speech recognition:', err);
        setError('음성 인식 시작 중 오류가 발생했습니다.');
        setIsRecording(false);
        console.log('handleMicClick: 녹음 시작 오류, 상태 false로 변경');
      }
    }
  };

  // --- Helper: Fetch Chatbot ID if not already set ---
  const fetchChatbotIdIfNeeded = useCallback(async (): Promise<string | null> => {
    if (chatbotIdForReferences) return chatbotIdForReferences;

    console.log('Attempting to fetch chatbot ID from session...');
    // 세션에서 chatbot_id를 가져오는 로직 (기존 fetchChatbotId 함수의 내용과 유사하게)
    if (!sessionId) {
      console.error('Session ID is missing, cannot fetch chatbot ID.');
      // toast.error('세션 정보가 없습니다.');
      return null;
    }
    try {
      // student_sessions 테이블에서 chatbot_id 조회
      const { data, error } = await supabase
        .from('student_sessions')
        .select('chatbot_id')
        .eq('id', sessionId)
        .single();

      if (error || !data?.chatbot_id) {
        console.error('Error fetching chatbot ID from session:', error);
        throw new Error('Failed to fetch chatbot ID from session');
      }
      console.log('Fetched chatbot ID:', data.chatbot_id);
      setChatbotIdForReferences(data.chatbot_id); // 상태 업데이트
      return data.chatbot_id;
    } catch (err: any) {
      console.error('Error in fetchChatbotIdIfNeeded:', err);
      // toast.error(err.message || '챗봇 정보를 가져오는데 실패했습니다.');
      return null;
    }
  }, [supabase, sessionId, chatbotIdForReferences]); // 의존성 배열 업데이트

  // 메시지 전송 핸들러 (수정: 이미지 URL 사용)
  const handleSendMessage = useCallback(async () => {
    const trimmedMessage = inputMessage.trim();
    // 메시지 또는 이미지가 없으면 전송 안 함
    if (!trimmedMessage && !uploadedImageUrl) return;
    // 로딩 중이면 전송 안 함
    if (isLoading) return;
    // 세션 ID 없으면 오류 처리
    if (!sessionId) {
      setError('세션 정보가 유효하지 않습니다. 페이지를 새로고침해주세요.');
      // toast.error('Session is invalid. Please refresh the page.');
      return;
    }
    if (!studentId) {
      setError('학생 정보가 유효하지 않습니다.');
      // toast.error('Student information is invalid.');
      return;
    }

    setIsLoading(true);
    setError(null);
    const userMessageId = uuidv4();
    const botMessageId = uuidv4();

    const currentUserMessage: Message = {
      id: userMessageId,
      text: trimmedMessage,
      sender: 'user',
      imageUrl: uploadedImageUrl, // 업로드된 이미지 URL 사용
    };
    setMessages(prev => [...prev, currentUserMessage]);
    setInputMessage('');
    removeSelectedImage(); // 메시지 전송 후 이미지 선택 상태 초기화

    // DB에 사용자 메시지 저장 (API 호출 대신 직접 저장)
    try {
      const { error: insertError } = await supabase
        .from('chat_messages') // 실제 테이블명 확인!
        .insert({
          session_id: sessionId,
          sender: 'student', // 'student' 역할 사용
          message: trimmedMessage,
          student_id: studentId, // studentId 저장
          image_url: uploadedImageUrl, // 이미지 URL 저장
          // is_voice_input: false, // 필요 시 추가
        });
      if (insertError) {
        console.error('Error saving user message to DB:', insertError);
        // toast.error('메시지 저장 중 오류 발생');
        // 여기서 메시지 제거 또는 오류 표시 UI 추가 가능
      }
    } catch (dbError) {
      console.error('DB Error saving user message:', dbError);
      // toast.error('메시지 저장 중 심각한 오류 발생');
    }

    // Add bot's placeholder message
    setMessages(prev => [...prev, { id: botMessageId, text: '', sender: 'bot', isStreaming: true }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedMessage,
          sessionId: sessionId,
          imageUrl: uploadedImageUrl // 업로드된 이미지 URL 전달
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // 스트리밍 처리
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedChunks = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedChunks += decoder.decode(value, { stream: true });

        // Update the bot message with the streaming content
        setMessages(prev => prev.map(msg =>
          msg.id === botMessageId
            ? { ...msg, text: accumulatedChunks, isStreaming: true }
            : msg
        ));
      }

      // 스트리밍 완료
      setMessages(prev => prev.map(msg =>
        msg.id === botMessageId
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (err: any) {
      console.error('Chat API error:', err);
      setError(err.message || '메시지 전송 중 오류가 발생했습니다.');
      setMessages(prev => prev.map(msg =>
        msg.id === botMessageId
          ? { ...msg, text: `오류: ${err.message || '응답 생성 실패'}`, isStreaming: false, isError: true } // isError 같은 상태 추가 고려
          : msg
      ));
      // toast.error(`Error: ${err.message || 'Failed to get response'}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    inputMessage,
    uploadedImageUrl,
    sessionId,
    studentId,
    setMessages,
    removeSelectedImage,
    setError,
    setIsLoading,
    setInputMessage,
    supabase
  ]);

  // Enter 키로 메시지 전송 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // 참고 자료 모달 열기 및 데이터 로드
  const openReferenceModal = async () => {
    if (!chatbotIdForReferences) {
      setReferenceError('챗봇 정보를 먼저 로드해야 합니다.');
      return;
    }
    setShowReferenceModal(true);
    referenceModalRef.current?.showModal();
    setIsLoadingReferences(true);
    setReferenceError(null);

    try {
      const response = await fetch(`/api/teacher/chatbots/${chatbotIdForReferences}/references`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '참고 자료를 불러오는데 실패했습니다.');
      }
      const data: ReferenceMaterial[] = await response.json();
      setReferenceFiles(data);
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : '참고 자료 로딩 중 오류 발생');
      console.error(err);
    } finally {
      setIsLoadingReferences(false);
    }
  };

  // 참고 자료 모달 닫기
  const closeReferenceModal = () => {
    setShowReferenceModal(false);
    referenceModalRef.current?.close();
  };

  // 파일 열기 핸들러 (수정)
  const handleOpenFile = async (filePath: string) => {
    console.log('Requesting signed URL for:', filePath);
    // TODO: 로딩 상태 표시 추가 가능
    try {
      const response = await fetch(`/api/files/signed-url?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 링크 생성에 실패했습니다.');
      }
      const data = await response.json();
      const signedUrl = data.signedUrl;

      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer'); // 새 탭에서 열기
      } else {
        throw new Error('서버에서 유효한 URL을 받지 못했습니다.');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert(`파일을 여는 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // TODO: 로딩 상태 종료
    }
  };

  // 학습 목표 모달 열기 함수 수정
  const openGoalModal = async () => {
    const currentChatbotId = await fetchChatbotIdIfNeeded(); // 수정된 헬퍼 함수 사용
    if (!currentChatbotId || !studentId) {
      // toast.error("챗봇 정보 또는 학생 정보가 없어 학습 목표를 열 수 없습니다.");
      return;
    }
    setShowGoalModal(true);
    setIsLoadingGoals(true);
    setGoalError(null);
    try {
      const response = await fetch(`/api/chatbots/${currentChatbotId}/goals?studentId=${studentId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch learning goals');
      }
      const data: LearningGoal[] = await response.json();
      console.log("Fetched Learning Goals with Student Responses:", data);
      setLearningGoals(data);
    } catch (err: any) {
      console.error('Error fetching learning goals:', err);
      setGoalError(err.message || '학습 목표를 불러오는데 실패했습니다.');
      // toast.error(err.message || 'Failed to load learning goals.');
    } finally {
      setIsLoadingGoals(false);
    }
  };

  // 학습 목표 모달 닫기
  const closeGoalModal = () => {
    setShowGoalModal(false);
    goalModalRef.current?.close();
  };

  // 학습 목표 체크 변경 핸들러 수정 (LearningGoal 상태 직접 업데이트)
  const handleGoalCheckChange = (goalId: string, checked: CheckedState) => { // 임시 CheckedState 타입 사용
    const isChecked = checked === true;
    setLearningGoals(prevGoals =>
      prevGoals.map(goal =>
        goal.id === goalId
          ? {
              ...goal,
              student_response: {
                ...(goal.student_response ?? {}),
                checked_by_student: isChecked,
                 evaluated_by_ai: goal.student_response?.evaluated_by_ai ?? null,
                 evaluation_comment: goal.student_response?.evaluation_comment ?? null,
              } as LearningGoal['student_response'],
            }
          : goal
      )
    );
  };

  // 학습 목표 제출 핸들러 수정 (LearningGoal 상태에서 checked_by_student 사용)
  const handleGoalSubmit = async () => {
    if (!studentId || !chatbotIdForReferences) {
      // toast.error("학생 또는 챗봇 정보가 유효하지 않아 제출할 수 없습니다.");
      return;
    }

    setIsSubmittingGoals(true);
    setGoalError(null);

    // 제출할 데이터 포맷 (goalId와 학생 체크 여부만 필요)
    const responsesToSubmit = learningGoals.map(goal => ({
        goalId: goal.id,
        // student_response가 있고 checked_by_student가 boolean이면 그 값을, 아니면 false를 보냄
        checked_by_student: typeof goal.student_response?.checked_by_student === 'boolean'
                            ? goal.student_response.checked_by_student
                            : false,
    }));

    try {
      const response = await fetch('/api/student-goal-responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('student_token')}` // Assuming token is stored
        },
        body: JSON.stringify({
          studentId: studentId,
          chatbotId: chatbotIdForReferences,
          responses: responsesToSubmit,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit goal responses');
      }

      // toast.success('학습 목표 응답이 저장되었습니다!');
      closeGoalModal(); // 성공 시 모달 닫기

    } catch (err: any) {
      console.error('Error submitting goal responses:', err);
      setGoalError(err.message || '학습 목표 응답 저장 중 오류가 발생했습니다.');
      // toast.error(`오류: ${err.message || 'Failed to save responses.'}`);
    } finally {
      setIsSubmittingGoals(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* 상단 헤더 영역 (예시) */}
      <div className="bg-white shadow-sm p-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold">{chatbotSlug}</h1> {/* 챗봇 이름 표시 (필요시 API로 조회) */} 
        {/* 사용 횟수 표시 */} 
        <div className="text-sm text-gray-600">
          {maxAttempts === null || maxAttempts === 0 ? (
            <span>사용 횟수: {currentAttempts + 1}회</span> // 현재 세션 포함해서 표시
          ) : (
            <span>
              남은 횟수: {Math.max(0, maxAttempts - (currentAttempts + 1))}회 
              <span className="text-xs text-gray-400 ml-1">({currentAttempts + 1}/{maxAttempts})</span>
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={openReferenceModal}
            className="p-2 text-gray-600 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="참고 자료 보기"
            disabled={!chatbotIdForReferences} // 챗봇 ID 로드 후 활성화
          >
            <BookOpenIcon className="h-6 w-6" />
          </button>
          <button
            onClick={openGoalModal}
            className="p-2 text-gray-600 hover:text-green-600 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="학습 목표 확인"
            disabled={!chatbotIdForReferences}
          >
            <ClipboardDocumentCheckIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 메시지 표시 영역 */}
      <div className="flex-1 overflow-y-auto p-4 pb-32"> {/* 하단 입력 영역 높이만큼 패딩 추가 */}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
            <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md break-words ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'}`}>
              {/* 이미지 렌더링 */}
              {msg.imageUrl && (
                <div className="mb-2">
                  <Image
                    src={msg.imageUrl} // Should be a string here due to check
                    alt="User upload"
                    width={200}
                    height={200}
                    className="rounded object-cover"
                    unoptimized // External or Blob URLs
                  />
                </div>
              )}
              {/* 텍스트 렌더링 (공백 및 줄바꿈 유지) */}
              {msg.text && (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}
              {/* 스트리밍 로더 표시 */}
              {msg.sender === 'bot' && msg.isStreaming && (
                <BeatLoader size={8} color="#6B7280" className="mt-1" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} /> {/* 스크롤 대상 */}
      </div>

      {/* 하단 입력 영역 (position: fixed) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        {/* 이미지 미리보기 */} 
        <div className="mb-2 flex items-center space-x-2">
          {imagePreviewUrl && (
            <div className="relative inline-block">
              <Image src={imagePreviewUrl} alt="Preview" width={60} height={60} className="rounded object-cover" />
              {isUploadingImage && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                        <BeatLoader color="#ffffff" size={8} />
                    </div>
                )}
                {uploadError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-70 rounded" title={uploadError}>
                         <ExclamationCircleIcon className="h-6 w-6 text-white" />
                    </div>
                )}
                 <button
                    onClick={removeSelectedImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 focus:outline-none"
                    aria-label="Remove image"
                    title="Remove image"
                    disabled={isUploadingImage}
                 >
                    <XMarkIcon className="h-4 w-4" />
                 </button>
            </div>
          )}
        </div>
        {/* 입력 컨트롤 */} 
        <div className="flex items-end">
          {/* 이미지 업로드 버튼 */}
          <button
            onClick={handleUploadClick}
            className="mr-2 p-2 text-gray-500 hover:text-blue-500 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Upload image"
            disabled={isLoading || isUploadingImage || isRecording}
          >
            <PhotoIcon className="h-6 w-6" />
          </button>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={fileInputRef}
            className="hidden"
            disabled={isLoading || isUploadingImage || isRecording}
          />
          {/* 텍스트 입력 */}
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            className="flex-1 border border-gray-300 rounded-lg p-2 resize-none overflow-y-auto max-h-40 focus:outline-none focus:ring-1 focus:ring-blue-500 text-black" // text-black 확인
            rows={1}
            disabled={isLoading || isUploadingImage || isRecording}
          />
          {/* 마이크 버튼 */}
          <div className="flex items-center space-x-1">
            {/* 마이크 버튼 */} 
            <button
              type="button"
              onClick={handleMicClick} // Restore original handler
              className={`p-2 rounded-md text-gray-500 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
              aria-label={isRecording ? "음성 녹음 중지" : "음성 녹음 시작"}
              disabled={!isMicReady} // Use state for disabled attribute
            >
              <MicrophoneIcon className="h-6 w-6" />
            </button>
          </div>
          {/* 전송 버튼 */}
          <button
            onClick={handleSendMessage}
            disabled={isLoading || isUploadingImage || (!inputMessage.trim() && !uploadedImageUrl)} // Disable if loading or input is empty
            className={`ml-2 p-2 rounded-full transition-colors ${isLoading || isUploadingImage || (!inputMessage.trim() && !uploadedImageUrl) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            aria-label="Send message"
          >
            {isLoading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PaperAirplaneIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 참고 자료 모달 */}
      {showReferenceModal && (
        <dialog ref={referenceModalRef} className="modal modal-open">
          <div className="modal-box w-11/12 max-w-3xl">
            <h3 className="font-bold text-lg mb-4">참고 자료 목록</h3>
            {isLoadingReferences ? (
              <div className="flex justify-center items-center h-40">
                <BeatLoader color="#36d7b7" />
              </div>
            ) : referenceError ? (
              <p className="text-red-500">오류: {referenceError}</p>
            ) : referenceFiles.length === 0 ? (
              <p>이 챗봇에 공개된 참고 자료가 없습니다.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {referenceFiles.map((file) => (
                  <li key={file.id} className="p-2 border rounded hover:bg-gray-100 flex justify-between items-center">
                    <span className="truncate">{file.file_name}</span>
                    <button
                      onClick={() => handleOpenFile(file.storage_path)}
                      className="btn btn-xs btn-outline btn-primary"
                    >
                      열기
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-action mt-6">
              <button className="btn btn-sm btn-ghost" onClick={closeReferenceModal}>닫기</button>
            </div>
          </div>
        </dialog>
      )}

      {/* 학습 목표 확인 모달 수정 */}
      {showGoalModal && (
        <dialog ref={goalModalRef} className="modal modal-open">
          <div className="modal-box w-11/12 max-w-2xl">
            <h3 className="font-bold text-lg mb-4">학습 목표 확인</h3>
            {isLoadingGoals ? (
              <div className="flex justify-center items-center h-40">
                <BeatLoader color="#36d7b7" />
              </div>
            ) : goalError ? (
              <p className="text-red-500">오류: {goalError}</p>
            ) : learningGoals.length === 0 ? (
              <p>이 챗봇에 설정된 학습 목표가 없습니다.</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {learningGoals.map((goal, index) => (
                  <div key={goal.id} className="p-4 border rounded-lg shadow-sm bg-white">
                    <p className="font-semibold mb-2">{index + 1}. {goal.goal_text}</p>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 gap-4">
                      {/* 학생 자가 체크 */}
                      <div className="flex items-center space-x-2">
                         <Checkbox
                            id={`goal-${goal.id}`}
                            checked={goal.student_response?.checked_by_student ?? false}
                            onCheckedChange={(checked: CheckedState) => handleGoalCheckChange(goal.id, checked)} // 타입 명시
                            disabled={isSubmittingGoals}
                         />
                         <Label htmlFor={`goal-${goal.id}`} className="text-sm font-medium">스스로 달성했다고 생각하나요?</Label>
                      </div>

                      {/* AI 평가 결과 표시 - Tooltip 임시 비활성화 */}
                      <div className="flex items-center space-x-2 text-sm text-gray-600 border-l-2 pl-4 border-gray-200">
                        {goal.student_response?.evaluated_by_ai === true ? (
                          // <TooltipProvider> ... </TooltipProvider> // 임시 주석
                          <span className="flex items-center text-green-600 font-medium">
                             <ClipboardDocumentCheckIcon className="h-5 w-5 mr-1" /> AI: 달성
                             {/* Tooltip 내용 */}
                             {goal.student_response.evaluation_comment && <span className="tooltip-placeholder">({goal.student_response.evaluation_comment})</span>}
                          </span>
                        ) : goal.student_response?.evaluated_by_ai === false ? (
                          // <TooltipProvider> ... </TooltipProvider> // 임시 주석
                           <span className="flex items-center text-red-600 font-medium">
                               <ExclamationCircleIcon className="h-5 w-5 mr-1" /> AI: 미달성
                               {/* Tooltip 내용 */}
                              {goal.student_response.evaluation_comment && <span className="tooltip-placeholder">({goal.student_response.evaluation_comment})</span>}
                           </span>
                        ) : goal.student_response?.evaluated_by_ai === null ? (
                           <span className="flex items-center text-gray-500 italic">
                                AI 평가 진행중...
                           </span>
                        ) : (
                           <span className="flex items-center text-gray-400 italic">
                                AI 평가 정보 없음
                           </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-action mt-6">
              <button className="btn btn-sm btn-ghost" onClick={closeGoalModal} disabled={isSubmittingGoals}>닫기</button>
              <button
                className={`btn btn-sm btn-primary ${isSubmittingGoals ? 'loading' : ''}`}
                onClick={handleGoalSubmit}
                disabled={isSubmittingGoals || isLoadingGoals || learningGoals.length === 0}
              >
                {isSubmittingGoals ? '저장 중...' : '자가 체크 결과 저장'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
};

export default ChatInterface;
