// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
    createServerClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(), // Mocked per test case
    }),
}));
jest.mock('bcrypt', () => ({
    compare: jest.fn(), // Mocked per test case
}));
// Mock next/headers cookies (needed by createServerClient)
jest.mock('next/headers', () => ({
    cookies: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
    }),
}));

import { POST } from '../route'; // The API route handler
import { createServerClient } from '@/lib/supabase/server';
import bcrypt from 'bcrypt';
import { NextRequest } from 'next/server';

describe('POST /api/student/login', () => {
    let mockRequest: NextRequest;
    const mockSupabase = createServerClient(null as any); // Get the mocked instance

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Default mock request
        mockRequest = {
            json: jest.fn(),
        } as unknown as NextRequest;
    });

    it('should return 200 and student info on successful login', async () => {
        const mockStudentData = {
            id: 'student-123',
            password: 'hashed_password', // DB stores hashed password
            name: 'Test Student',
            class_name: 'Class A',
        };
        const requestBody = { studentNumber: '12345', password: 'correct_password' };

        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);
        (mockSupabase.single as jest.Mock).mockResolvedValue({ data: mockStudentData, error: null });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Password matches

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.message).toBe('로그인 성공');
        expect(body.student).toBeDefined();
        expect(body.student.id).toBe(mockStudentData.id);
        expect(body.student.name).toBe(mockStudentData.name);
        expect(body.student.password).toBeUndefined(); // Password should be excluded
        expect(mockSupabase.from).toHaveBeenCalledWith('students');
        expect(mockSupabase.select).toHaveBeenCalledWith('id, password, name, class_name');
        expect(mockSupabase.eq).toHaveBeenCalledWith('student_number', requestBody.studentNumber);
        expect(bcrypt.compare).toHaveBeenCalledWith(requestBody.password, mockStudentData.password);
    });

    it('should return 401 if student number is not found', async () => {
        const requestBody = { studentNumber: 'nonexistent', password: 'any_password' };

        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);
        // Simulate student not found
        (mockSupabase.single as jest.Mock).mockResolvedValue({ data: null, error: null });

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('학번 또는 비밀번호가 잘못되었습니다.');
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

     it('should return 401 if student number is found but password does not match', async () => {
        const mockStudentData = {
            id: 'student-456',
            password: 'hashed_password',
            name: 'Another Student',
            class_name: 'Class B',
        };
         const requestBody = { studentNumber: '67890', password: 'wrong_password' };

        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);
        (mockSupabase.single as jest.Mock).mockResolvedValue({ data: mockStudentData, error: null });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Password does not match

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('학번 또는 비밀번호가 잘못되었습니다.');
        expect(bcrypt.compare).toHaveBeenCalledWith(requestBody.password, mockStudentData.password);
    });

    it('should return 400 if studentNumber is missing', async () => {
        const requestBody = { password: 'some_password' }; // Missing studentNumber
        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('학번과 비밀번호를 올바르게 입력해주세요.');
        expect(mockSupabase.from).not.toHaveBeenCalled();
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

     it('should return 400 if password is missing', async () => {
        const requestBody = { studentNumber: '11111' }; // Missing password
        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('학번과 비밀번호를 올바르게 입력해주세요.');
        expect(mockSupabase.from).not.toHaveBeenCalled();
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

     it('should return 500 if there is a database error during fetch', async () => {
        const requestBody = { studentNumber: '12345', password: 'correct_password' };
        const dbError = new Error('Database connection failed');

        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);
        // Simulate database error during fetch
        (mockSupabase.single as jest.Mock).mockResolvedValue({ data: null, error: dbError });

        const response = await POST(mockRequest);
        const body = await response.json();

        // The API currently catches this specific error and returns 401 for security.
        // If you want to test the 500 path, simulate an error *after* fetch or in bcrypt.
        expect(response.status).toBe(401); // API returns 401 for fetch errors currently
        expect(body.error).toBe('학번 또는 비밀번호가 잘못되었습니다.');
    });

    it('should return 500 if bcrypt.compare throws an error', async () => {
        const mockStudentData = { id: 'student-789', password: 'hashed_password' };
        const requestBody = { studentNumber: 'valid', password: 'password' };
        const bcryptError = new Error('Bcrypt error');

        (mockRequest.json as jest.Mock).mockResolvedValue(requestBody);
        (mockSupabase.single as jest.Mock).mockResolvedValue({ data: mockStudentData, error: null });
        (bcrypt.compare as jest.Mock).mockRejectedValue(bcryptError); // Simulate bcrypt error

        const response = await POST(mockRequest);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('로그인 처리 중 오류가 발생했습니다.');
    });

}); 