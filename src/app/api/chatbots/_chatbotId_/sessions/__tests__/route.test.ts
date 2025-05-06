import { POST } from '@/app/api/chatbots/_chatbotId_/sessions/route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 모킹 (표준 클라이언트)
jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

// Mock Supabase 함수들
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockSupabaseAuthGetUser = jest.fn();
const mockCountSelect = jest.fn();

// Supabase 클라이언트 모킹 구현 (체이닝 개선)
const mockSupabaseClient = {
    from: mockFrom.mockImplementation((tableName) => ({
        select: mockSelect.mockImplementation((selectStr, options) => {
            // count 쿼리 처리
            if (options?.count === 'exact') {
                return {
                    eq: mockEq.mockImplementation(() => ({ // eq 이후에도 eq 가능
                        eq: mockCountSelect, // 최종 count 반환 함수 연결
                    })),
                };
            }
            // 일반 select 처리
            return {
                eq: mockEq.mockImplementation(() => ({ // eq 이후 single, eq 가능
                    single: mockSingle,
                    maybeSingle: mockMaybeSingle,
                    eq: mockEq, // 자기 자신을 반환하여 eq 체이닝 지원
                })),
                // select 직후 single 등 (필요시 추가)
                single: mockSingle,
            };
        }),
        insert: mockInsert.mockImplementation(() => ({
             select: jest.fn().mockImplementation(() => ({ // insert -> select
                 single: mockSingle, // insert -> select -> single
             })),
        })),
    })),
    auth: {
        getUser: mockSupabaseAuthGetUser,
    },
};

describe('POST /api/chatbots/:chatbotId/sessions', () => {
    let mockRequest: Partial<NextRequest>;
    const chatbotId = 'test-chatbot-id';
    const studentAuthId = 'test-student-auth-id';
    const studentProfileId = 'test-student-profile-id';
    const studentClassId = 'test-class-id';
    const testToken = 'test-jwt-token';

    beforeEach(() => {
        // 모킹 초기화
        jest.clearAllMocks();
        mockFrom.mockClear();
        mockSelect.mockClear();
        mockEq.mockClear();
        mockSingle.mockClear();
        mockMaybeSingle.mockClear();
        mockInsert.mockClear();
        mockSupabaseAuthGetUser.mockClear();
        mockCountSelect.mockClear();
        (createClient as jest.Mock).mockClear();

        // createClient가 모킹된 Supabase 클라이언트를 반환하도록 설정
        (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

        // 기본 사용자(학생) 정보 모킹 (토큰 기반) - 여기는 유지
        mockSupabaseAuthGetUser.mockResolvedValue({
            data: { user: { id: studentAuthId } },
            error: null,
        });

        // 기본 요청 객체 설정 (인증 헤더 포함)
        mockRequest = {
            headers: new Headers({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`,
            }),
        };
    });

    it('should successfully start a session if access is allowed and attempts are available', async () => {
        // Mocking 순서: 1. Profile 조회 성공, 2. Chatbot 조회 성공, 3. Session Count 성공, 4. Session Insert 성공
        const mockProfileData = { id: studentProfileId, class_id: studentClassId };
        const mockChatbotData = {
            id: chatbotId,
            allowed_classes: [studentClassId, 'other-class-id'],
            max_attempts: 3,
        };
        const mockNewSession = { id: 'new-session-123', student_id: studentProfileId, chatbot_id: chatbotId };

        mockSingle // 1. Profile 조회
            .mockResolvedValueOnce({ data: mockProfileData, error: null });
        mockSingle // 2. Chatbot 조회
            .mockResolvedValueOnce({ data: mockChatbotData, error: null });

        // 3. Session Count 조회 모킹 (count=1)
        mockCountSelect.mockResolvedValueOnce({ count: 1, error: null });

        mockSingle // 4. Session Insert -> select -> single
            .mockResolvedValueOnce({ data: mockNewSession, error: null });

        // API 호출
        const response = await POST(mockRequest as NextRequest, { params: { chatbotId } });
        const body = await response.json();

        // 검증 (기대값 확인)
        expect(response.status).toBe(201);
        expect(body.id).toBe('new-session-123');
        expect(body.student_id).toBe(studentProfileId);
        expect(body.current_attempts).toBe(2);
        expect(body.max_attempts).toBe(3);

        // 호출 순서 및 횟수 검증 강화
        expect(mockSupabaseAuthGetUser).toHaveBeenCalledTimes(1);
        expect(mockFrom).toHaveBeenCalledTimes(4); // profiles, chatbots, sessions(count), sessions(insert)
        expect(mockSingle).toHaveBeenCalledTimes(3); // profile, chatbot, insert-select
        expect(mockCountSelect).toHaveBeenCalledTimes(1);
    });

     it('should return 403 if student class is not allowed for the chatbot', async () => {
         // Mocking 순서: 1. Profile 조회 성공, 2. Chatbot 조회 성공 (허용 안됨)
         const mockProfileData = { id: studentProfileId, class_id: studentClassId };
         const mockChatbotData = {
             id: chatbotId,
             allowed_classes: ['other-class-id-1', 'other-class-id-2'], // 학생 클래스 ID 없음
             max_attempts: 3,
         };
         mockSingle // 1. Profile 조회
             .mockResolvedValueOnce({ data: mockProfileData, error: null });
         mockSingle // 2. Chatbot 조회
             .mockResolvedValueOnce({ data: mockChatbotData, error: null });

         // API 호출
         const response = await POST(mockRequest as NextRequest, { params: { chatbotId } });
         const body = await response.json();

         // 검증
         expect(response.status).toBe(403);
         expect(body.error).toContain('Access denied. This chatbot is not available for your class.'); // API 에러 메시지 확인

         expect(mockSupabaseAuthGetUser).toHaveBeenCalledTimes(1);
         expect(mockFrom).toHaveBeenCalledTimes(2); // profiles, chatbots
         expect(mockSingle).toHaveBeenCalledTimes(2); // profile, chatbot
         expect(mockInsert).not.toHaveBeenCalled();
         expect(mockCountSelect).not.toHaveBeenCalled();
     });

     it('should return 429 if student has reached the maximum attempts', async () => {
         // Mocking 순서: 1. Profile 조회 성공, 2. Chatbot 조회 성공, 3. Session Count 성공 (횟수 초과)
         const mockProfileData = { id: studentProfileId, class_id: studentClassId };
         const mockChatbotData = {
             id: chatbotId,
             allowed_classes: [studentClassId],
             max_attempts: 2,
         };
         mockSingle // 1. Profile 조회
             .mockResolvedValueOnce({ data: mockProfileData, error: null });
         mockSingle // 2. Chatbot 조회
             .mockResolvedValueOnce({ data: mockChatbotData, error: null });

         // 3. Session Count 조회 모킹 (count=2)
         mockCountSelect.mockResolvedValueOnce({ count: 2, error: null });

         // API 호출
         const response = await POST(mockRequest as NextRequest, { params: { chatbotId } });
         const body = await response.json();

         // 검증
         expect(response.status).toBe(429);
         expect(body.error).toContain('Usage limit exceeded');

         expect(mockSupabaseAuthGetUser).toHaveBeenCalledTimes(1);
         expect(mockFrom).toHaveBeenCalledTimes(3); // profiles, chatbots, sessions(count)
         expect(mockSingle).toHaveBeenCalledTimes(2); // profile, chatbot
         expect(mockCountSelect).toHaveBeenCalledTimes(1);
         expect(mockInsert).not.toHaveBeenCalled();
     });

     // 클래스별 횟수 제한 테스트 주석 처리 유지
     /* ... */

     it('should return 401 if student is not authenticated', async () => {
         // Mocking 순서: 1. Auth getUser 실패
         mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token'} });

         // API 호출
         const response = await POST(mockRequest as NextRequest, { params: { chatbotId } });
         const body = await response.json();

         // 검증
         expect(response.status).toBe(401);
         expect(body.error).toBe('Invalid token');

         expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith(testToken);
         expect(mockFrom).not.toHaveBeenCalled();
         expect(mockCountSelect).not.toHaveBeenCalled();
     });

     it('should return 403 if student profile is not found', async () => {
          // Mocking 순서: 1. Profile 조회 실패
          mockSingle // 1. Profile 조회
              .mockResolvedValueOnce({ data: null, error: { message: 'Profile not found' } });

          // API 호출
          const response = await POST(mockRequest as NextRequest, { params: { chatbotId } });
          const body = await response.json();

          // 검증
          expect(response.status).toBe(403);
          expect(body.error).toContain('Student profile not found');

          expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith(testToken);
          expect(mockFrom).toHaveBeenCalledTimes(1); // profiles
          expect(mockSingle).toHaveBeenCalledTimes(1); // profile
          expect(mockFrom).not.toHaveBeenCalledWith('chatbots');
          expect(mockCountSelect).not.toHaveBeenCalled();
          expect(mockInsert).not.toHaveBeenCalled();
     });

});
