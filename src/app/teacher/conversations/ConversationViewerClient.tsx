'use client';

import React, { useState, useEffect, useCallback } from 'react';

// 대화 목록 데이터 타입 (예시, 실제 DB 스키마에 맞게 조정 필요)
interface ConversationSummary {
  id: string;
  student_name: string; // 학생 이름 (조인 필요)
  chatbot_name: string; // 챗봇 이름 (조인 필요)
  last_message_at: string; // 마지막 메시지 시간
  // 필요한 다른 요약 정보 추가
}

// 상세 대화 메시지 타입 (예시)
interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  created_at: string;
  image_url?: string | null;
}

export default function ConversationViewerClient() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [messagePage, setMessagePage] = useState<number>(1);
  const [totalMessagePages, setTotalMessagePages] = useState<number>(1);
  const conversationLimit = 15;
  const messageLimit = 20;

  // 대화 목록 불러오기 (페이지네이션 및 필터링)
  const fetchConversations = useCallback(async (pageToFetch: number) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', pageToFetch.toString());
      params.append('limit', conversationLimit.toString());
      if (debouncedSearchTerm) {
        params.append('studentName', debouncedSearchTerm);
      }
      const apiUrl = `/api/teacher/conversations?${params.toString()}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch conversations: ${response.statusText}`);
      }
      const data = await response.json();
      setConversations(data.conversations || []);
      setTotalPages(Math.ceil((data.totalCount || 0) / conversationLimit));
      setCurrentPage(pageToFetch);

    } catch (error: any) {
      console.error('Failed to fetch conversations:', error);
      setListError(error.message || '대화 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingList(false);
    }
  }, [debouncedSearchTerm, conversationLimit]);

  // 특정 대화의 메시지 불러오기 (페이지네이션 적용)
  const fetchMessages = useCallback(async (conversationId: string, pageToFetch: number = 1) => {
    if (pageToFetch === 1) {
      setIsLoadingMessages(true);
    } else {
      setIsLoadingMoreMessages(true);
    }
    setMessageError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', pageToFetch.toString());
      params.append('limit', messageLimit.toString());
      const response = await fetch(`/api/teacher/conversations/${conversationId}/messages?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch messages: ${response.statusText}`);
      }
      const data = await response.json();
      const fetchedMessages: Message[] = data.messages || [];
      const totalCount: number = data.totalCount || 0;

      setTotalMessagePages(Math.ceil(totalCount / messageLimit));

      const orderedMessages = fetchedMessages.reverse();

      if (pageToFetch === 1) {
        setMessages(orderedMessages);
      } else {
        setMessages(prev => [...orderedMessages, ...prev]);
      }
      setMessagePage(pageToFetch);

    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      setMessageError(error.message || '메시지를 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingMessages(false);
      setIsLoadingMoreMessages(false);
    }
  }, [messageLimit]);

  // 검색어 변경 시 디바운싱 처리
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // debouncedSearchTerm 또는 currentPage 변경 시 대화 목록 다시 불러오기
  useEffect(() => {
    if (debouncedSearchTerm !== '') {
      setCurrentPage(1);
      fetchConversations(1);
    } else {
      fetchConversations(currentPage);
    }
  }, [debouncedSearchTerm, fetchConversations]);

  // 컴포넌트 마운트 시 첫 페이지 로드 (초기 검색어 없을 때)
  useEffect(() => {
    if (debouncedSearchTerm === '') {
      fetchConversations(1);
    }
  }, []);

  // 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchConversations(newPage);
    }
  };

  // 대화 목록 항목 클릭 핸들러
  const handleConversationSelect = (id: string) => {
    setSelectedConversationId(id);
    setMessages([]);
    setMessagePage(1);
    setTotalMessagePages(1);
    setMessageError(null);
    fetchMessages(id, 1);
  };

  // 이전 메시지 더 보기 버튼 핸들러
  const handleLoadMoreMessages = () => {
    if (selectedConversationId && !isLoadingMoreMessages && messagePage < totalMessagePages) {
      fetchMessages(selectedConversationId, messagePage + 1);
    }
  };

  return (
    <div className="flex h-[calc(100vh-150px)]"> 
      {/* 대화 목록 영역 */} 
      <div className="w-1/3 border-r border-gray-200 overflow-y-auto p-4 flex flex-col"> 
        <h2 className="text-lg font-semibold mb-4">대화 목록</h2>
        {/* 검색 입력 필드 추가 */} 
        <input
          type="text"
          placeholder="학생 이름으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-4 p-2 border border-gray-300 rounded"
        />
        {isLoadingList && <p>목록 로딩 중...</p>}
        {listError && <p className="text-red-500">오류: {listError}</p>}
        {!isLoadingList && !listError && (
          <ul className="flex-grow overflow-y-auto"> 
            {conversations.length > 0 ? (
              conversations.map((conv) => (
                <li
                  key={conv.id}
                  className={`p-3 mb-2 rounded cursor-pointer hover:bg-gray-100 ${selectedConversationId === conv.id ? 'bg-blue-100 font-semibold' : ''}`}
                  onClick={() => handleConversationSelect(conv.id)}
                >
                  <p className="font-medium text-gray-800">{conv.student_name}</p>
                  <p className="text-sm text-gray-600">챗봇: {conv.chatbot_name}</p>
                  <p className="text-xs text-gray-500">마지막 메시지: {new Date(conv.last_message_at).toLocaleString()}</p>
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500">표시할 대화가 없습니다.</p>
            )}
          </ul>
        )}
        {/* 페이지네이션 컨트롤 */} 
        {!isLoadingList && totalPages > 1 && (
          <div className="mt-4 flex justify-center items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1 border rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            <span>{currentPage} / {totalPages}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 border rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 메시지 표시 영역 */} 
      <div className="w-2/3 p-4 flex flex-col bg-white">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">대화 내용</h2>
        {selectedConversationId ? (
          <div className="flex-grow overflow-y-auto flex flex-col space-y-4 pr-2"> 
            {/* 이전 메시지 더 보기 버튼 */} 
            {messagePage < totalMessagePages && (
              <button
                onClick={handleLoadMoreMessages}
                disabled={isLoadingMoreMessages}
                className="mb-4 px-4 py-2 border rounded bg-blue-100 hover:bg-blue-200 disabled:opacity-50 w-full"
              >
                {isLoadingMoreMessages ? '로딩 중...' : '이전 메시지 더 보기'}
              </button>
            )}
            {isLoadingMessages && <p className="text-center">메시지 로딩 중...</p>}
            {messageError && <p className="text-red-500 text-center">오류: {messageError}</p>}
            {!isLoadingMessages && messages.length === 0 && !messageError && (
              <p className="text-center text-gray-500">메시지가 없습니다.</p>
            )}
            {!isLoadingMessages && !messageError && messages.length > 0 && (
              <div>
                {messages.map((msg) => {
                  const timeStampClasses = `text-xs mt-1 text-right ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-400'}`;

                  return (
                    <div key={msg.id} className={`mb-3 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`rounded-lg px-4 py-2 max-w-md break-words ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'}`}>
                        {msg.image_url && (
                          <img 
                            src={msg.image_url} 
                            alt="첨부 이미지" 
                            className="max-w-xs rounded mb-2 cursor-pointer" 
                            onClick={() => { 
                              if (msg.image_url) {
                                window.open(msg.image_url, '_blank');
                              }
                            }} 
                          />
                        )}
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <p className={timeStampClasses}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">왼쪽 목록에서 대화를 선택하세요.</p>
        )}
      </div> 
    </div> 
  );
}
