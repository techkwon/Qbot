// /Users/techkwon/my-app/ChatCat/src/app/api/teacher/chatbots/[chatbotId]/references/__tests__/route.test.ts
import { GET, POST, DELETE } from '../route'; // 테스트 대상 핸들러 임포트
import { NextRequest } from 'next/server';
// import { cookies } from 'next/headers'; // 사용하지 않으므로 제거
import { createClient } from '@supabase/ssr'; // 실제 함수 이름으로 변경
import { verifyTeacherRole } from '@/lib/authUtils';

// --- Mocking Dependencies ---

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(), // Although we use set({ value: '' }), keep remove mock for completeness
  })),
}));

// Mock @supabase/ssr
const mockSupabaseStorage = {
  upload: jest.fn(),
  remove: jest.fn(() => ({ data: null, error: null })), // Ensure remove returns { data, error }
};
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  storage: {
    from: jest.fn().mockReturnValue(mockSupabaseStorage),
  },
  from: jest.fn(), // Will be implemented per test using mockImplementation
};
jest.mock('@supabase/ssr', () => ({
  createClient: jest.fn(() => mockSupabaseClient), // 함수 이름 변경
}));

// Mock @/lib/authUtils
jest.mock('@/lib/authUtils', () => ({
  verifyTeacherRole: jest.fn(),
}));

// --- Helper Functions (Optional) ---
// Helper to create a mock NextRequest
const createMockRequest = (method: string, body?: any, searchParams?: Record<string, string>): NextRequest => {
    const url = new URL(`http://localhost/api/teacher/chatbots/test-chatbot-id/references`);
    if (searchParams) {
        Object.entries(searchParams).forEach(([key, value]) => url.searchParams.set(key, value));
    }

    const requestInit: RequestInit = { method };
    if (body) {
        if (body instanceof FormData) {
            requestInit.body = body;
        } else {
            // For GET, DELETE (with body), PUT, POST (non-FormData)
            requestInit.body = JSON.stringify(body);
            requestInit.headers = { 'Content-Type': 'application/json' };
        }
    }
    // Ensure DELETE with body has correct headers if applicable
    if (method === 'DELETE' && body && !(body instanceof FormData)) {
        if (!requestInit.headers) requestInit.headers = {};
        (requestInit.headers as Record<string,string>)['Content-Type'] = 'application/json';
    }

    return new NextRequest(url.toString(), requestInit as any);
};

// --- Test Suites ---
describe('API Route: /api/teacher/chatbots/[chatbotId]/references', () => {
  const chatbotId = 'test-chatbot-id';
  const teacherUserId = 'teacher-user-id';
  const mockUser = { id: teacherUserId };
  const mockParams = { params: { chatbotId } };

  beforeEach(() => {
    jest.clearAllMocks();
    (mockSupabaseClient.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: mockUser }, error: null });
    (verifyTeacherRole as jest.Mock).mockResolvedValue(true);
    (mockSupabaseStorage.upload as jest.Mock).mockReset();
    (mockSupabaseStorage.remove as jest.Mock).mockReset();
    (mockSupabaseClient.from as jest.Mock).mockImplementation(() => ({ // Default empty implementation
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: new Error('Default Mock: Not Implemented') }),
        order: jest.fn().mockResolvedValue({ data: [], error: new Error('Default Mock: Not Implemented') }),
        match: jest.fn().mockResolvedValue({ data: null, error: new Error('Default Mock: Not Implemented') })
    }));
  });

  // --- POST Handler Tests ---
  describe('POST /', () => {
    it('should upload a file and return 201 on success', async () => {
      // Arrange
      const mockFilePath = `teacher_${teacherUserId}/chatbot_${chatbotId}/references/test.txt`;
      const mockFileData = { id: 'file-123', file_name: 'test.txt', file_path: mockFilePath, chatbot_id: chatbotId, teacher_id: teacherUserId };
      const chatbotData = { teacher_id: teacherUserId };

      const chatbotSelectMock = jest.fn().mockReturnThis();
      const chatbotEqMock = jest.fn().mockReturnThis();
      const chatbotSingleMock = jest.fn().mockResolvedValue({ data: chatbotData, error: null });
      chatbotSelectMock.mockReturnValue({ eq: chatbotEqMock });
      chatbotEqMock.mockReturnValue({ single: chatbotSingleMock });
      (mockSupabaseStorage.upload as jest.Mock).mockResolvedValue({ data: { path: mockFilePath }, error: null });

      (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
        console.log(`POST test: Mocking from('${table}')`); // Debug log
        if (table === 'chatbots') {
          return { select: chatbotSelectMock };
        } else if (table === 'reference_files') {
          return {
              insert: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                      single: jest.fn().mockResolvedValue({ data: mockFileData, error: null })
                  })
              })
          };
        }
        return {};
      });

      const mockFile = new File(['file content'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', mockFile);
      const request = createMockRequest('POST', formData);

      // Act
      const response = await POST(request, mockParams);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(responseBody).toBeDefined(); // Check if the body itself is defined
      expect(responseBody.id).toBe('file-123'); // Check specific fields of the response body
      expect(responseBody.file_name).toBe('test.txt');
      expect(responseBody.file_path).toBe(mockFilePath);

      // Verify calls
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledTimes(1);
      expect(verifyTeacherRole).toHaveBeenCalledWith(expect.anything(), mockUser);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chatbots');
      expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('reference-files');
      expect(mockSupabaseStorage.upload).toHaveBeenCalledWith(expect.stringContaining('test.txt'), mockFile, expect.any(Object));
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reference_files');
      // More specific check on insert call might be needed
      // expect((mockSupabaseClient.from as jest.Mock).mock.results[1].value.insert).toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', async () => {
      // Arrange: Mock failed authentication
      (mockSupabaseClient.auth.getUser as jest.Mock).mockResolvedValueOnce({ data: { user: null }, error: null });

      const formData = new FormData();
      formData.append('file', new File(['content'], 'test.txt'));
      const request = createMockRequest('POST', formData);

      // Act
      const response = await POST(request, mockParams);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(responseBody.error).toBe('인증되지 않은 사용자입니다.');
      expect(verifyTeacherRole).not.toHaveBeenCalled(); // Role check shouldn't happen
      expect(mockSupabaseStorage.upload).not.toHaveBeenCalled();
    });

    it('should return 403 if user is not a teacher', async () => {
      // Arrange: Mock user is not a teacher
      (verifyTeacherRole as jest.Mock).mockResolvedValue(false);

      const mockRequestBody = new FormData();
      mockRequestBody.append('file', new Blob(['file content']), 'test.txt');
      const request = createMockRequest('POST', mockRequestBody);

      // Act
      const response = await POST(request, mockParams);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(responseBody.error).toBe('권한이 없습니다. 교사만 접근 가능합니다.'); 
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('chatbots'); // Chatbot check shouldn't happen
      expect(mockSupabaseStorage.upload).not.toHaveBeenCalled();
    });

    it('should return 403 if teacher does not own the chatbot', async () => {
      // Arrange: Mock chatbot ownership failure
      (mockSupabaseClient.from as jest.Mock).mockImplementationOnce((table) => {
        if (table === 'chatbots') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { teacher_id: 'another-teacher-id' }, error: null }), // Different teacher ID
          };
        }
        return mockSupabaseClient;
      });

      const formData = new FormData();
      formData.append('file', new File(['content'], 'test.txt'));
      const request = createMockRequest('POST', formData);

      // Act
      const response = await POST(request, mockParams);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(responseBody.error).toBe('이 챗봇에 파일을 업로드할 권한이 없습니다.');
      expect(mockSupabaseStorage.upload).not.toHaveBeenCalled();
    });

    it('should return 400 if file is not provided', async () => {
      // Arrange: Mock successful ownership check, but no file in FormData
      (mockSupabaseClient.from as jest.Mock).mockImplementationOnce((table) => {
          if (table === 'chatbots') {
              return {
                  select: jest.fn().mockReturnThis(),
                  eq: jest.fn().mockReturnThis(),
                  single: jest.fn().mockResolvedValue({ data: { teacher_id: teacherUserId }, error: null }),
              };
          }
          return mockSupabaseClient;
      });

      const formData = new FormData(); // No file appended
      const request = createMockRequest('POST', formData);

      // Act
      const response = await POST(request, mockParams);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseBody.error).toBe('파일이 제공되지 않았습니다.');
      expect(mockSupabaseStorage.upload).not.toHaveBeenCalled();
    });

    // Add tests for storage upload errors, db insert errors etc.
  });

  // --- GET Handler Tests ---
  describe('GET /', () => {
    it('should return a list of files and 200 on success', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1', file_name: 'doc1.pdf', chatbot_id: chatbotId, teacher_id: teacherUserId },
        { id: 'file-2', file_name: 'image.png', chatbot_id: chatbotId, teacher_id: teacherUserId },
      ];

      const getSelectMock = jest.fn().mockReturnThis();
      const getEqMock = jest.fn().mockReturnThis();
      const getOrderMock = jest.fn().mockResolvedValue({ data: mockFiles, error: null });
      getSelectMock.mockReturnValue({ eq: getEqMock });
      getEqMock.mockReturnValue({ order: getOrderMock });

      // Use mockImplementationOnce for GET test mocks
      (mockSupabaseClient.from as jest.Mock)
        .mockImplementationOnce((table: string) => { // First call expected: chatbots
           console.log(`GET success test: Mocking from('${table}') - Call 1`); // Debug log
           if (table === 'chatbots') {
                return { select: jest.fn().mockReturnThis().mockReturnValue({ eq: jest.fn().mockReturnThis().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { teacher_id: teacherUserId }, error: null }) }) }) };
           }
           console.warn(`Unexpected table in GET success mock (Call 1): ${table}`);
           return {};
        })
        .mockImplementationOnce((table: string) => { // Second call expected: reference_files
           console.log(`GET success test: Mocking from('${table}') - Call 2`); // Debug log
           if (table === 'reference_files') {
               return { select: getSelectMock };
           }
            console.warn(`Unexpected table in GET success mock (Call 2): ${table}`);
           return {};
        });

      const request = createMockRequest('GET');

      // Act
      console.log("Executing GET request in test...");
      const response = await GET(request, mockParams);
      console.log(`GET request completed with status: ${response.status}`);
      const responseBody = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(responseBody).toEqual(mockFiles);
      expect(verifyTeacherRole).toHaveBeenCalledWith(expect.anything(), mockUser);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chatbots'); // Check if chatbot check was called
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reference_files');
      expect(getEqMock).toHaveBeenCalledWith('chatbot_id', chatbotId);
      expect(getOrderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should return 500 if database fetch fails', async () => {
        // Arrange
        const dbError = new Error('Database connection lost');
        const getSelectMock = jest.fn().mockReturnThis();
        const getEqMock = jest.fn().mockReturnThis();
        const getOrderMock = jest.fn().mockResolvedValue({ data: null, error: dbError });
        getSelectMock.mockReturnValue({ eq: getEqMock });
        getEqMock.mockReturnValue({ order: getOrderMock });

         (mockSupabaseClient.from as jest.Mock)
            .mockImplementationOnce((table: string) => { // First call: chatbots (assume success)
                console.log(`GET 500 test: Mocking from('${table}') - Call 1`);
                if (table === 'chatbots') {
                    return { select: jest.fn().mockReturnThis().mockReturnValue({ eq: jest.fn().mockReturnThis().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { teacher_id: teacherUserId }, error: null }) }) }) };
                }
                 console.warn(`Unexpected table in GET 500 mock (Call 1): ${table}`);
                return {};
            })
            .mockImplementationOnce((table: string) => { // Second call: reference_files (fails)
                console.log(`GET 500 test: Mocking from('${table}') - Call 2`);
                if (table === 'reference_files') {
                    return { select: getSelectMock }; // This chain leads to the error
                }
                 console.warn(`Unexpected table in GET 500 mock (Call 2): ${table}`);
                return {};
            });

        const request = createMockRequest('GET');

        // Act
        console.log("Executing GET request in 500 test...");
        const response = await GET(request, mockParams);
        console.log(`GET request (500 test) completed with status: ${response.status}`);
        const responseBody = await response.json();

        // Assert
        expect(response.status).toBe(500);
        expect(responseBody.error).toBe('참고 자료 목록 조회 실패');
        // expect(responseBody.details).toBe(dbError.message); // Uncomment if API returns details
        expect(verifyTeacherRole).toHaveBeenCalledWith(expect.anything(), mockUser);
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('chatbots');
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('reference_files');
    });

    // ... other GET tests ...
  });

  // --- DELETE Handler Tests ---
  describe('DELETE /', () => {
    const fileIdToDelete = 'file-to-delete-id';
    const filePathToDelete = `teacher_${teacherUserId}/chatbot_${chatbotId}/references/delete_me.txt`;

    it('should delete a file and return 204 on success', async () => {
        // Arrange
        const fileFetchSelectMock = jest.fn().mockReturnThis();
        const fileFetchEqPathMock = jest.fn().mockReturnThis();
        const fileFetchEqChatbotMock = jest.fn().mockReturnThis();
        const fileFetchSingleMock = jest.fn().mockResolvedValue({ data: { id: fileIdToDelete, file_path: filePathToDelete, chatbot_id: chatbotId, uploaded_by: teacherUserId }, error: null });
        fileFetchSelectMock.mockReturnValue({ eq: fileFetchEqPathMock });
        fileFetchEqPathMock.mockReturnValue({ eq: fileFetchEqChatbotMock });
        fileFetchEqChatbotMock.mockReturnValue({ single: fileFetchSingleMock });

        (mockSupabaseStorage.remove as jest.Mock).mockResolvedValue({ data: [{ name: 'delete_me.txt' }], error: null });

        const dbDeleteMock = jest.fn().mockReturnThis();
        const dbDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
        dbDeleteMock.mockReturnValue({ eq: dbDeleteEqMock });

        (mockSupabaseClient.from as jest.Mock)
            .mockImplementationOnce((table: string) => { // First call: select reference_files by path
                 console.log(`DELETE success test: Mocking from('${table}') - Call 1`);
                if (table === 'reference_files') {
                    return { select: fileFetchSelectMock };
                }
                 console.warn(`Unexpected table in DELETE success mock (Call 1): ${table}`);
                return {};
            })
            .mockImplementationOnce((table: string) => { // Second call: delete reference_files by ID
                 console.log(`DELETE success test: Mocking from('${table}') - Call 2`);
                if (table === 'reference_files') {
                    return { delete: dbDeleteMock };
                }
                 console.warn(`Unexpected table in DELETE success mock (Call 2): ${table}`);
                return {};
            });

        const request = createMockRequest('DELETE', { filePath: filePathToDelete });

        // Act
        console.log("Executing DELETE request in test...");
        const response = await DELETE(request, mockParams);
        console.log(`DELETE request completed with status: ${response.status}`);

        // Assert
        expect(response.status).toBe(204);
        expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledTimes(1);
        expect(verifyTeacherRole).toHaveBeenCalledWith(expect.anything(), mockUser);
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('reference_files'); // Called twice
        expect(fileFetchEqPathMock).toHaveBeenCalledWith('file_path', filePathToDelete);
        expect(fileFetchEqChatbotMock).toHaveBeenCalledWith('chatbot_id', chatbotId);
        expect(fileFetchSingleMock).toHaveBeenCalled();
        expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('reference-files');
        expect(mockSupabaseStorage.remove).toHaveBeenCalledWith([filePathToDelete]);
        expect(dbDeleteEqMock).toHaveBeenCalledWith('id', fileIdToDelete);
    });

    it('should return 400 if filePath is missing in body', async () => {
        // Arrange: Send request with empty body
        const request = createMockRequest('DELETE', {}); // Empty body

        // Act
        const response = await DELETE(request, mockParams);
        const responseBody = await response.json();

        // Assert
        expect(response.status).toBe(400);
        expect(responseBody.error).toBe('삭제할 파일 경로(filePath)가 필요합니다.');
        expect(mockSupabaseStorage.remove).not.toHaveBeenCalled();
    });
  });
});
