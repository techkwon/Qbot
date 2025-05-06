'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Database } from '@/types/supabase'; // Supabase 타입 정의 경로 (실제 경로로 수정 필요)

// 참고 자료 타입 정의 (DB 스키마에 맞게 조정 필요)
type ReferenceFile = Database['public']['Tables']['reference_files']['Row'];

interface ReferenceFileManagerProps {
  chatbotId: string;
}

export default function ReferenceFileManager({ chatbotId }: ReferenceFileManagerProps) {
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 파일 목록 불러오기 함수
  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/chatbots/${chatbotId}/references`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 목록을 불러오는데 실패했습니다.');
      }
      const data: ReferenceFile[] = await response.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [chatbotId]);

  // 컴포넌트 마운트 시 파일 목록 불러오기
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // 파일 선택 핸들러
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  // 파일 업로드 핸들러
  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`/api/teacher/chatbots/${chatbotId}/references`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 업로드에 실패했습니다.');
      }

      // 업로드 성공 시 파일 목록 새로고침 및 선택된 파일 초기화
      await fetchFiles();
      setSelectedFile(null);
      // 파일 입력 요소 초기화 (선택 사항)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
      // TODO: 성공 메시지 표시 (Toast 등 활용)

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error(err);
      // TODO: 오류 메시지 표시 (Toast 등 활용)
    } finally {
      setIsUploading(false);
    }
  };

  // 파일 삭제 핸들러
  const handleDelete = async (fileId: string) => {
    if (!window.confirm('정말로 이 파일을 삭제하시겠습니까?')) {
      return;
    }
    // TODO: 특정 파일 삭제 시 로딩 상태 관리 추가 가능
    setError(null);

    try {
      const response = await fetch(`/api/teacher/chatbots/${chatbotId}/references/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 삭제에 실패했습니다.');
      }

      // 삭제 성공 시 파일 목록에서 해당 파일 제거 (상태 직접 업데이트)
      setFiles((prevFiles) => prevFiles.filter((file) => file.id !== fileId));
      // 또는 fetchFiles(); // 목록 전체 새로고침

      // TODO: 성공 메시지 표시 (Toast 등 활용)

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error(err);
      // TODO: 오류 메시지 표시 (Toast 등 활용)
    } finally {
       // TODO: 로딩 상태 종료
    }
  };

  // 공개 여부 변경 핸들러
  const handleTogglePublic = async (fileId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // 낙관적 업데이트: API 호출 전에 UI를 먼저 변경
    setFiles((prevFiles) =>
      prevFiles.map((file) =>
        file.id === fileId ? { ...file, is_public: newStatus } : file
      )
    );
    setError(null);

    try {
      const response = await fetch(`/api/teacher/chatbots/${chatbotId}/references/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_public: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '공개 여부 변경에 실패했습니다.');
      }

      // 성공 시 별도 처리 불필요 (이미 낙관적 업데이트됨)
      // TODO: 성공 메시지 표시 (Toast 등 활용)

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error(err);
      // 오류 발생 시 롤백: 원래 상태로 되돌림
      setFiles((prevFiles) =>
        prevFiles.map((file) =>
          file.id === fileId ? { ...file, is_public: currentStatus } : file
        )
      );
      // TODO: 오류 메시지 표시 (Toast 등 활용)
    }
  };

  return (
    <div className="space-y-6 p-4 border rounded-md shadow-sm">
      <h3 className="text-lg font-semibold mb-4">참고 자료 관리</h3>

      {/* 파일 업로드 섹션 */}
      <div className="flex items-center space-x-2">
        <input
          type="file"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
          className={`px-4 py-2 rounded-md text-sm font-medium ${ 
            !selectedFile || isUploading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isUploading ? '업로드 중...' : '업로드'}
        </button>
      </div>
       {/* 업로드 상태 또는 오류 메시지 표시 (추후 구현) */}


      {/* 파일 목록 섹션 */}
      <div className="mt-6">
        <h4 className="text-md font-semibold mb-2">업로드된 파일 목록</h4>
        {isLoading && <p>목록을 불러오는 중...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!isLoading && !error && files.length === 0 && (
          <p className="text-gray-500">업로드된 파일이 없습니다.</p>
        )}
        {!isLoading && !error && files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between p-2 border rounded-md">
                <span className="truncate flex-1 mr-4">{file.file_name}</span>
                <div className="flex items-center space-x-4">
                  {/* 공개 여부 토글 (추후 구현) */}
                  <label className="flex items-center cursor-pointer">
                     <input type="checkbox" className="sr-only peer" checked={file.is_public} onChange={() => handleTogglePublic(file.id, file.is_public)} />
                     <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">공개</span>
                  </label>
                  {/* 삭제 버튼 (추후 구현) */}
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
} 