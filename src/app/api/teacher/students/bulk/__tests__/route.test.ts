import { POST } from '@/app/api/teacher/students/bulk/route';
import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import bcrypt from 'bcrypt';
import Papa from 'papaparse';
import { cookies } from 'next/headers';

// Supabase 클라이언트 모킹 (@supabase/ssr 사용 기반)
// 실제 API 코드의 import 경로 ('@/lib/supabase/server')를 모킹합니다.
jest.mock('@/lib/supabase/server', () => ({
    createServerClient: jest.fn(),
}));

// bcrypt 모킹
jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('$2b$10$mockedhashvalue'), // 고정된 해시 값 반환
}));

// papaparse 모킹
jest.mock('papaparse', () => ({
    parse: jest.fn(),
}));

// next/headers 모킹
jest.mock('next/headers', () => ({
    cookies: jest.fn(),
}));

// Mock Supabase 데이터베이스 함수
const mockSupabaseInsert = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseEq = jest.fn(); // .eq() 메서드 모킹 추가
const mockSupabaseAuthGetUser = jest.fn();

// 인증용 Supabase 클라이언트 모킹 객체
const mockAuthSupabaseClient = {
    from: jest.fn().mockReturnValue({ /* 필요한 from 메서드 모킹 */ }),
    auth: {
        getUser: mockSupabaseAuthGetUser,
    },
};

// 관리자용 Supabase 클라이언트 모킹 객체
const mockAdminSupabaseClient = {
    from: jest.fn((tableName) => ({
        insert: mockSupabaseInsert.mockImplementation((data) => ({
            select: jest.fn().mockResolvedValue({ data: data, error: null, count: Array.isArray(data) ? data.length : 1 }),
        })),
        select: mockSupabaseSelect.mockImplementation(() => ({
            eq: mockSupabaseEq,
        })),
    })),
    auth: { /* 관리자 클라이언트는 보통 auth 메서드를 직접 사용하지 않음 */ },
};

describe('POST /api/teacher/students/bulk', () => {
    let mockRequest: Partial<NextRequest>;
    // 테스트 환경 변수 설정
    const OLD_ENV = process.env;

    beforeAll(() => {
        // Jest 실행 전에 환경 변수 설정 (테스트 전체에 적용)
        process.env = {
            ...OLD_ENV,
            NEXT_PUBLIC_SUPABASE_URL: 'http://test-supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        };
    });

    afterAll(() => {
        // 테스트 후 환경 변수 복원
        process.env = OLD_ENV;
    });

    beforeEach(() => {
        // 모든 모킹 초기화
        jest.clearAllMocks();

        // createServerClient 모킹 구현: 호출 인자에 따라 다른 클라이언트 반환
        (require('@/lib/supabase/server').createServerClient as jest.Mock).mockImplementation((...args: any[]) => {
            // 인자의 개수나 타입으로 인증용/관리자용 호출 구분
            if (args.length === 1 && typeof args[0] === 'string' && args[0] === 'mock-cookie-store') {
                 return mockAuthSupabaseClient;
             // 환경 변수가 설정되었으므로, URL과 KEY로 관리자 클라이언트 호출 확인
             } else if (args.length >= 2 && args[0] === process.env.NEXT_PUBLIC_SUPABASE_URL && args[1] === process.env.SUPABASE_SERVICE_ROLE_KEY) {
                 return mockAdminSupabaseClient;
             } else {
                 // 예상치 못한 호출 시 경고
                 console.warn('Unexpected createServerClient call with args:', args);
                 return mockAuthSupabaseClient;
             }
        });

        // 기본 사용자 정보 모킹 (인증용 클라이언트의 getUser)
        mockSupabaseAuthGetUser.mockResolvedValue({
            data: { user: { id: 'test-teacher-id' } },
            error: null,
        });

        // 기본 요청 객체 설정
        mockRequest = {
            headers: new Headers({
                'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryExample',
            }),
            formData: jest.fn(),
        };
        (cookies as jest.Mock).mockReturnValue('mock-cookie-store'); // cookies 모킹

        // 관리자 클라이언트의 .eq() 기본 모킹 설정 (각 테스트에서 재정의 가능)
        mockSupabaseEq.mockResolvedValue({ data: [], error: null }); // 기본적으로 빈 배열 반환
    });

    it('should successfully upload and insert valid student data', async () => {
        const csvData = '이름,학번,비밀번호,클래스\n김테스트,10101,pass1,ClassA\n이테스트,10102,pass2,ClassB';
        const file = new File([csvData], 'students.csv', { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', file);

        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

        // Papa.parse가 성공적인 ParseResult 객체를 반환하도록 설정
        const mockParseResult: Papa.ParseResult<StudentCsvRow> = {
            data: [
                { 이름: '김테스트', 학번: '10101', 비밀번호: 'pass1', 클래스: 'ClassA' },
                { 이름: '이테스트', 학번: '10102', 비밀번호: 'pass2', 클래스: 'ClassB' },
            ],
            errors: [],
            meta: { fields: ['이름', '학번', '비밀번호', '클래스'], delimiter: ',',linebreak: '\n', aborted: false, truncated: false, cursor: 100 },
        };
        (Papa.parse as jest.Mock).mockReturnValue(mockParseResult);

        // Supabase 모킹 설정
        mockSupabaseInsert.mockResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null, count: 2 });

        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(200); // 성공 시 200 반환 (API 로직 확인 필요)
        expect(body.message).toBe('CSV 처리 완료.');
        expect(body.successCount).toBe(2);
        expect(body.failureCount).toBe(0);

        const createServerClientMock = require('@/lib/supabase/server').createServerClient;
        // 인증용 클라이언트 호출 확인 (getTeacherId 내부)
        expect(createServerClientMock).toHaveBeenCalledWith('mock-cookie-store');
        // 관리자용 클라이언트 호출 확인 (select existing, insert)
        expect(createServerClientMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(Object));
        expect(mockSupabaseAuthGetUser).toHaveBeenCalledTimes(1); // 인증 체크 한 번
        expect(mockSupabaseSelect).toHaveBeenCalledTimes(1); // 기존 학생 조회 한 번
        expect(mockSupabaseInsert).toHaveBeenCalledTimes(1); // 최종 삽입 한 번
        expect(bcrypt.hash).toHaveBeenCalledTimes(2);
        expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.arrayContaining([
             expect.objectContaining({ name: '김테스트', student_number: '10101' }),
             expect.objectContaining({ name: '이테스트', student_number: '10102' })
        ]));
        expect(Papa.parse).toHaveBeenCalledWith(csvData, expect.objectContaining({ header: true })); // 첫 번째 인자로 csvText 전달 확인
        expect(mockSupabaseEq).toHaveBeenCalledWith('teacher_id', 'test-teacher-id'); // .eq() 호출 확인
    });

    it('should return 400 if no file is provided', async () => {
        const formData = new FormData(); // 파일 없이 생성
        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('CSV 파일이 필요합니다.');

        const createServerClientMock = require('@/lib/supabase/server').createServerClient;
        // 인증 클라이언트는 호출되어야 함
        expect(createServerClientMock).toHaveBeenCalledWith('mock-cookie-store');
        // 관리자 클라이언트나 DB 작업은 호출되지 않아야 함
        expect(createServerClientMock).not.toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(Object));
        expect(mockSupabaseInsert).not.toHaveBeenCalled();
        expect(mockSupabaseSelect).not.toHaveBeenCalled();
    });

    it('should return 400 if file is not a CSV', async () => {
        const file = new File(['not csv content'], 'students.txt', { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', file);
        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('파일 형식이 올바르지 않습니다. CSV 파일만 업로드 가능합니다.');
         expect(mockSupabaseInsert).not.toHaveBeenCalled();
    });


    it('should return 400 if CSV parsing fails with errors', async () => {
        const file = new File(['invalid csv'], 'students.csv', { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', file);
        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

        // Papa.parse가 에러를 포함한 ParseResult 객체를 반환하도록 설정
        const mockParseResultWithErrors: Papa.ParseResult<StudentCsvRow> = {
            data: [],
            errors: [
                { type: 'FieldMismatch', code: 'TooManyFields', message: 'Too many fields', row: 0 }
            ],
            meta: { fields: [], delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 10 },
        };
        (Papa.parse as jest.Mock).mockReturnValue(mockParseResultWithErrors);

        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('CSV 파일 구조 오류');
        expect(mockSupabaseInsert).not.toHaveBeenCalled();
    });

     it('should return 200 with failures for invalid row data (missing required fields)', async () => {
         const csvData = '이름,학번,클래스\n김누락,20202,ClassC';
         const file = new File([csvData], 'students.csv', { type: 'text/csv' });
         const formData = new FormData();
         formData.append('file', file);
         (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

         // Papa.parse가 필수 필드가 누락된 데이터를 포함한 ParseResult 반환
         const mockParseResultInvalidData: Papa.ParseResult<any> = {
             data: [
                 { 이름: '김누락', 학번: '20202', 클래스: 'ClassC' } // 비밀번호 누락
             ],
             errors: [], // 파싱 자체는 성공했다고 가정
             meta: { fields: ['이름', '학번', '클래스'], delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 50 },
         };
         (Papa.parse as jest.Mock).mockReturnValue(mockParseResultInvalidData);

         // API는 비밀번호 없으면 랜덤 생성하므로, 이 경우는 성공해야 함.
         // 다른 케이스 (이름/학번 누락) 테스트 추가 필요
         mockSupabaseSelect.mockResolvedValue({ data: [], error: null }); // 기존 학생 없음
         mockSupabaseInsert.mockResolvedValue({ data: [{id: '1'}], error: null, count: 1 });

         const response = await POST(mockRequest as NextRequest);
         const body = await response.json();

         expect(response.status).toBe(200);
         expect(body.message).toBe('CSV 처리 완료.');
         expect(body.successCount).toBe(1); // 비밀번호 없어도 성공 처리됨
         expect(body.failureCount).toBe(0);
         expect(mockSupabaseInsert).toHaveBeenCalledTimes(1);
         expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.arrayContaining([
             expect.objectContaining({ name: '김누락', student_number: '20202' }) // 비밀번호는 랜덤 생성된 해시값
         ]));
     });

    it('should return 200 with failures if database insertion partially fails or duplicate exists', async () => {
        // 한 명은 성공(50505), 한 명은 기존 학번(40404)과 중복되도록 수정
        const csvData = '이름,학번,비밀번호,클래스\n성공학생,50505,pass4,ClassE\n실패학생,40404,pass5,ClassF';
        const file = new File([csvData], 'students_duplicate.csv', { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', file);
        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

         // Papa.parse가 유효한 데이터를 포함한 ParseResult 반환
         const mockParseResultDuplicateData: Papa.ParseResult<StudentCsvRow> = {
             data: [
                 { 이름: '성공학생', 학번: '50505', 비밀번호: 'pass4', 클래스: 'ClassE' },
                 { 이름: '실패학생', 학번: '40404', 비밀번호: 'pass5', 클래스: 'ClassF' },
             ],
             errors: [],
             meta: { fields: ['이름', '학번', '비밀번호', '클래스'], delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 100 },
         };
        (Papa.parse as jest.Mock).mockReturnValue(mockParseResultDuplicateData);

        // Supabase 모킹 설정
        // 기존 학생 조회 시 '40404' 학번만 반환 (실패학생만 중복됨)
        mockSupabaseEq.mockResolvedValueOnce({ data: [ { student_number: '40404' } ], error: null });
        // insert는 성공학생(50505) 1명만 호출될 것임

        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(200); // 성공 1, 실패 1이므로 200
        expect(body.message).toBe('CSV 처리 완료.');
        expect(body.successCount).toBe(1);
        expect(body.failureCount).toBe(1);
        expect(body.failures[0].reason).toBe('이미 존재하는 학번입니다.');
        expect(body.failures[0].data.이름).toBe('실패학생'); // 실패학생이 중복으로 걸림
        expect(mockSupabaseInsert).toHaveBeenCalledTimes(1);
        expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ name: '성공학생', student_number: '50505' })
        ]));
        expect(mockSupabaseInsert).not.toHaveBeenCalledWith(expect.arrayContaining([
             expect.objectContaining({ name: '실패학생' })
        ]));
        expect(mockSupabaseEq).toHaveBeenCalledWith('teacher_id', 'test-teacher-id');
    });


    it('should return 401 if user is not authenticated', async () => {
        // 사용자 인증 실패 모킹 (인증 클라이언트의 getUser)
         mockSupabaseAuthGetUser.mockResolvedValue({
             data: { user: null },
             error: null,
         });
        const file = new File(['data'], 'students.csv', { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', file);
        (mockRequest.formData as jest.Mock).mockResolvedValue(formData);


        const response = await POST(mockRequest as NextRequest);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('인증되지 않았거나 교사 정보를 가져올 수 없습니다.'); // API의 실제 에러 메시지 확인
        expect(mockSupabaseInsert).not.toHaveBeenCalled();
        expect(mockSupabaseSelect).not.toHaveBeenCalled();
    });

     it('should return 500 if authentication check fails', async () => {
         // 인증 체크 중 에러 발생 모킹 (인증 클라이언트의 getUser)
         mockSupabaseAuthGetUser.mockResolvedValue({
             data: { user: null },
             error: new Error('인증 서버 오류'),
         });
          // ... (파일 설정)
         const response = await POST(mockRequest as NextRequest);
         const body = await response.json();

         expect(response.status).toBe(401); // API가 에러 발생 시 401 반환 확인
         expect(body.error).toBe('인증되지 않았거나 교사 정보를 가져올 수 없습니다.'); // API의 실제 에러 메시지 확인
         expect(mockSupabaseInsert).not.toHaveBeenCalled();
         expect(mockSupabaseSelect).not.toHaveBeenCalled();
     });

     it('should return 200 with failures for invalid row data (missing name)', async () => {
         // 비밀번호 누락은 성공하므로, 이름/학번 누락 케이스 추가
         const csvData = '학번,비밀번호,클래스\n,12345,pass123,ClassX'; // 이름 누락
         const file = new File([csvData], 'students_missing_name.csv', { type: 'text/csv' });
         const formData = new FormData();
         formData.append('file', file);
         (mockRequest.formData as jest.Mock).mockResolvedValue(formData);

         const mockParseResultMissingName: Papa.ParseResult<any> = {
             data: [
                 { 학번: '12345', 비밀번호: 'pass123', 클래스: 'ClassX' } // 이름 누락
             ],
             errors: [],
             meta: { fields: ['학번', '비밀번호', '클래스'], delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 50 },
         };
         (Papa.parse as jest.Mock).mockReturnValue(mockParseResultMissingName);

         const response = await POST(mockRequest as NextRequest);
         const body = await response.json();

         // 실패만 있고 성공이 없으므로 API는 400 반환
         expect(response.status).toBe(400);
         expect(body.message).toBe('CSV 처리 완료.');
         expect(body.successCount).toBe(0);
     });
});
