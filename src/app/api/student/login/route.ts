import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { Database } from '@/types/supabase';
import bcrypt from 'bcrypt'; // bcrypt 임포트

// !!! SECURITY WARNING !!!
// THESE SHOULD BE STORED IN ENVIRONMENT VARIABLES (.env.local)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ynrborfizjcsdxrdnyug.supabase.co'; // Replace with your actual Supabase URL if not using env var
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucmJvcmZpempjc2R4cmRueXVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjE0NzgxOCwiZXhwIjoyMDYxNzIzODE4fQ.V217IIpbOctcKMSKQrYK4nw8BUjHJb12RRh8KUl6X8M'; // Replace with your actual Service Role Key if not using env var
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secure-jwt-secret'; // !!! REPLACE WITH A STRONG, RANDOM SECRET IN .env.local !!!

// 로그인 요청 본문 스키마
const loginSchema = z.object({
	studentNumber: z.string().min(1, '학번을 입력해주세요.'),
	password: z.string().min(1, '비밀번호를 입력해주세요.'),
});

export async function POST(request: NextRequest) {
	const cookieStore = cookies();
	// 주의: 학생 로그인은 일반 anon 키로 DB 접근 후 비밀번호 검증만 수행합니다.
	// 여기서 admin 클라이언트를 사용하면 안 됩니다.
	const supabase = createServerClient<Database>(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: { /* 쿠키 설정 */
				get(name: string) {
					return cookieStore.get(name)?.value
				},
				set(name: string, value: string, options: any) {
					cookieStore.set({ name, value, ...options })
				},
				remove(name: string, options: any) {
					cookieStore.delete({ name, ...options })
				},
			}
		}
	);

	try {
		// 1. 요청 본문 파싱 및 유효성 검사
		let body;
		try {
			body = await request.json();
		} catch (e) {
			return new NextResponse(JSON.stringify({ error: '잘못된 요청 형식입니다.' }), { status: 400 });
		}

		const validation = loginSchema.safeParse(body);
		if (!validation.success) {
			return new NextResponse(JSON.stringify({ error: '학번과 비밀번호를 올바르게 입력해주세요.', details: validation.error.errors }), { status: 400 });
		}

		const { studentNumber, password } = validation.data;

		// 2. students 테이블에서 학생 조회
		// PRD의 students 테이블 구조 가정: student_number, password (hashed) 컬럼 존재
		const { data: student, error: fetchError } = await supabase
			.from('students') // 실제 학생 테이블 이름 확인 필요
			.select('id, password, name, class_name') // 비밀번호 및 필요한 정보 선택
			.eq('student_number', studentNumber)
			.single();

		if (fetchError || !student) {
			// 학생이 없거나 DB 오류 시 동일하게 401 반환 (보안상 구체적인 오류 노출 X)
			console.warn(`Login attempt failed for student number: ${studentNumber} - Not found or DB error.`);
			return new NextResponse(JSON.stringify({ error: '학번 또는 비밀번호가 잘못되었습니다.' }), { status: 401 });
		}

		// 3. 비밀번호 비교
		// !!! 중요: bcrypt 라이브러리 필요 !!!
		const isPasswordValid = await bcrypt.compare(password, student.password);
		// const isPasswordValid = password === student.password; // 임시: bcrypt 없이 텍스트 비교 (절대 실제 사용 금지!)
		// TODO: 위 라인을 실제 bcrypt.compare 로직으로 교체해야 합니다.

		if (!isPasswordValid) {
			console.warn(`Login attempt failed for student number: ${studentNumber} - Invalid password.`);
			return new NextResponse(JSON.stringify({ error: '학번 또는 비밀번호가 잘못되었습니다.' }), { status: 401 });
		}

		// 4. 로그인 성공
		// 여기서 Supabase Auth 세션을 직접 생성하는 것은 복잡함 (admin 권한 필요 등)
		// 대신, 성공 상태와 함께 필요한 최소한의 학생 정보를 반환하여
		// 클라이언트에서 후속 처리 (예: 상태 저장, Supabase 리스너 트리거)를 하도록 유도
		console.log(`Student login successful: ${studentNumber}`);
		// 민감 정보(비밀번호) 제외하고 반환
		const { password: _, ...studentInfo } = student;
		return NextResponse.json({ message: '로그인 성공', student: studentInfo }, { status: 200 });

	} catch (error: any) {
		console.error('Student Login API Error:', error);
		return new NextResponse(JSON.stringify({ error: '로그인 처리 중 오류가 발생했습니다.' }), { status: 500 });
	}
}
