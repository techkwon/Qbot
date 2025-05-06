'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import { toast } from 'sonner'; // 토스트 추가
import { Button } from '@/components/ui/button'; // Shadcn/ui 버튼 사용 (설치 필요)
import { Input } from '@/components/ui/input'; // Shadcn/ui 입력 필드 사용 (설치 필요)
import { Download } from 'lucide-react'; // 아이콘 사용 (설치 필요)

// 학생 데이터 타입 정의 (API 응답과 일치해야 함)
interface Student {
  id: string;
  name: string;
  student_number: string;
  class_name: string;
  created_at: string;
  // 필요한 다른 필드 (예: user_id)
}

// 챗봇 데이터 타입 정의 (이름과 ID만 필요)
interface ChatbotInfo {
    id: string;
    name: string;
}

// CSV 업로드 응답 타입
interface CsvUploadResponse {
    message: string;
    successCount: number;
    failureCount: number;
    failures: { row: number; reason: string; data: any }[];
}

export default function StudentManagementPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [chatbots, setChatbots] = useState<ChatbotInfo[]>([]); // 챗봇 목록 상태
  const [selectedChatbotId, setSelectedChatbotId] = useState<string>(''); // 선택된 챗봇 ID 상태
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);
  const [isLoadingChatbots, setIsLoadingChatbots] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({}); // 학생별 액션 로딩 상태

  const [isUploadingCsv, setIsUploadingCsv] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null); // 파일 입력 참조

  // 학생 목록 불러오는 함수
  const fetchStudents = useCallback(async () => {
    setIsLoadingStudents(true);
    setError(null);
    try {
      const response = await fetch('/api/teacher/students');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: Student[] = await response.json();
      setStudents(data);
    } catch (err: any) {
      console.error('Failed to fetch students:', err);
      setError(err.message || '학생 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingStudents(false);
    }
  }, []);

  // 챗봇 목록 불러오는 함수
  const fetchChatbots = useCallback(async () => {
    setIsLoadingChatbots(true);
    setError(null); // 오류 상태 초기화
    try {
      const response = await fetch('/api/teacher/chatbots'); // 챗봇 목록 API
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: ChatbotInfo[] = await response.json(); // 필요한 데이터만 포함 (id, name)
      setChatbots(data);
    } catch (err: any) {
      console.error('Failed to fetch chatbots:', err);
      setError(err.message || '챗봇 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingChatbots(false);
    }
  }, []);

  // 컴포넌트 마운트 시 데이터 불러오기
  useEffect(() => {
    fetchStudents();
    fetchChatbots();
  }, [fetchStudents, fetchChatbots]);

  // 챗봇 선택 핸들러
  const handleChatbotSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedChatbotId(e.target.value);
  };

  // 학생 사용 횟수 초기화 핸들러
  const handleResetAttempts = async (studentId: string, studentName: string) => {
    if (!selectedChatbotId) {
      alert('먼저 챗봇을 선택해주세요.');
      return;
    }

    const selectedChatbot = chatbots.find(cb => cb.id === selectedChatbotId);
    if (!selectedChatbot) {
        alert('선택된 챗봇 정보를 찾을 수 없습니다.');
        return;
    }

    if (window.confirm(`정말로 '${studentName}' 학생의 '${selectedChatbot.name}' 챗봇 사용 횟수를 초기화하시겠습니까?`)) {
      setActionLoading(prev => ({ ...prev, [`reset_${studentId}`]: true }));
      setError(null);
      try {
        const response = await fetch(`/api/teacher/chatbots/${selectedChatbotId}/manage-attempts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scope: 'student',
            studentId: studentId,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.details || `Failed to reset attempts: ${response.status}`);
        }

        toast.success(`'${studentName}' 학생의 '${selectedChatbot.name}' 챗봇 사용 횟수가 초기화되었습니다. ${result.message || ''}`);

      } catch (err: any) {
        console.error('Failed to reset attempts:', err);
        setError(err.message || '횟수 초기화 중 오류가 발생했습니다.');
        toast.error(`오류 발생: ${err.message || '횟수 초기화 실패'}`);
      } finally {
         setActionLoading(prev => ({ ...prev, [`reset_${studentId}`]: false }));
      }
    }
  };

  // CSV 업로드 핸들러
  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
        toast.error('CSV 파일만 업로드 가능합니다.');
        // 파일 입력 값 초기화 (같은 파일 재업로드 가능하도록)
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        return;
    }

    setIsUploadingCsv(true);
    setError(null);
    const toastId = toast.loading('CSV 파일을 업로드하고 처리 중입니다...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/teacher/students/bulk', {
        method: 'POST',
        body: formData,
      });

      const result: CsvUploadResponse = await response.json();

      if (!response.ok) {
        // API가 400 또는 500 에러를 반환한 경우
        throw new Error(result.message || `CSV 처리 중 서버 오류 발생 (Status: ${response.status})`);
      }

      // 성공 메시지
      let successMessage = `${result.successCount}명의 학생 정보가 성공적으로 등록되었습니다.`;
      if (result.failureCount > 0) {
        successMessage += ` ${result.failureCount}건의 오류가 발생했습니다.`;
        // 실패 상세 정보 콘솔에 출력 (개발/디버깅용)
        console.warn('CSV 처리 실패 상세:', result.failures);
        // 필요하다면 실패 목록을 사용자에게 보여주는 UI 추가 가능
      }
      toast.success(successMessage, { id: toastId });

      // 성공 후 학생 목록 다시 불러오기
      fetchStudents();

    } catch (err: any) {
      console.error('CSV upload failed:', err);
      toast.error(err.message || 'CSV 파일 업로드 및 처리 중 오류가 발생했습니다.', { id: toastId });
      setError(err.message || 'CSV 처리 실패');
    } finally {
      setIsUploadingCsv(false);
      // 파일 입력 값 초기화
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
    }
  };

  // TODO: 학생 추가/수정/삭제/CSV 업로드 기능 추가
  // TODO: 사용 횟수 관리 기능 추가 (챗봇 선택 로직 필요)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">학생 관리</h1>

      {/* 학생 추가 버튼 및 CSV 업로드 버튼 */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* 학생 개별 추가 버튼 (기능은 추후 구현) */}
        <Button disabled> + 학생 추가 </Button>

        {/* CSV 업로드 버튼 */} 
        <Button
          onClick={() => fileInputRef.current?.click()} // 숨겨진 파일 입력 클릭 트리거
          disabled={isUploadingCsv}
          variant="outline"
        >
          {isUploadingCsv ? '업로드 중...' : 'CSV로 대량 등록'}
        </Button>
        <Input
          type="file"
          ref={fileInputRef}
          onChange={handleCsvUpload}
          accept=".csv"
          className="hidden" // 실제 입력 필드는 숨김
        />

        {/* CSV 템플릿 다운로드 링크 */} 
        <a
          href="/student_template.csv" // public 폴더의 파일 경로
          download // 다운로드 속성
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Download className="mr-2 h-4 w-4" />
          CSV 템플릿 다운로드
        </a>
      </div>

      {/* 챗봇 선택 드롭다운 */} 
      <div className="mb-4 flex items-center space-x-2">
        <label htmlFor="chatbot-select" className="block text-sm font-medium text-gray-700">챗봇 선택:</label>
        <select
          id="chatbot-select"
          value={selectedChatbotId}
          onChange={handleChatbotSelect}
          disabled={isLoadingChatbots || chatbots.length === 0}
          className="mt-1 block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white disabled:bg-gray-100"
        >
          <option value="">-- 챗봇을 선택하세요 --</option>
          {chatbots.map((chatbot) => (
            <option key={chatbot.id} value={chatbot.id}>
              {chatbot.name}
            </option>
          ))}
        </select>
        {isLoadingChatbots && <span className="text-sm text-gray-500">챗봇 로딩 중...</span>}
      </div>

      {(isLoadingStudents) && <p>학생 목록 로딩 중...</p>}
      {error && <p className="text-red-500 mb-4">오류: {error}</p>}

      {!isLoadingStudents && !error && (
        <div className="overflow-x-auto shadow rounded-lg">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3 px-4 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                <th className="py-3 px-4 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학번</th>
                <th className="py-3 px-4 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">클래스</th>
                <th className="py-3 px-4 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                <th className="py-3 px-4 border-b text-center text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 px-4 text-center text-sm text-gray-500">등록된 학생이 없습니다.</td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-500">{student.student_number}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-500">{student.class_name}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-500">{new Date(student.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-center text-sm font-medium space-x-2">
                      {/* TODO: 학생 정보 수정 버튼 */}
                      {/* <button className="text-indigo-600 hover:text-indigo-900">수정</button> */}
                      {/* TODO: 학생 삭제 버튼 */}
                      {/* <button className="text-red-600 hover:text-red-900">삭제</button> */}
                      {/* 사용 횟수 초기화 버튼 */} 
                      <button
                        onClick={() => handleResetAttempts(student.id, student.name)}
                        disabled={!selectedChatbotId || actionLoading[`reset_${student.id}`]}
                        className="text-yellow-600 hover:text-yellow-900 disabled:text-gray-400 disabled:cursor-not-allowed text-xs px-2 py-1 rounded border border-yellow-500 hover:bg-yellow-50"
                        title={`선택된 챗봇 [${chatbots.find(cb => cb.id === selectedChatbotId)?.name || '선택 안됨'}] 사용 횟수 초기화`}
                      >
                        {actionLoading[`reset_${student.id}`] ? '처리중...' : '초기화'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 