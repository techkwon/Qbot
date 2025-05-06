import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server'; // Use your custom server client
import { Database } from '@/types/supabase';
import bcrypt from 'bcrypt';
import Papa from 'papaparse'; // Import papaparse

// !!! SECURITY WARNING !!!
// THESE SHOULD BE STORED IN ENVIRONMENT VARIABLES (.env.local)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BCRYPT_SALT_ROUNDS = 10; // Or get from env

// Helper function to create Supabase Admin client (consider moving to a shared lib)
const createSupabaseAdminClient = () => {
	return createServerClient<Database>(
		SUPABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY,
		{
			cookies: { get: () => undefined, set: () => {}, remove: () => {} }, // Dummy cookies
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			}
		}
	);
};

// Interface for expected CSV row structure
interface StudentCsvRow {
	이름: string;
	학번: string;
	비밀번호?: string;
	클래스?: string; // Optional, students might not be assigned initially
}

// Helper to get Teacher ID
async function getTeacherId(cookieStore: ReturnType<typeof cookies>): Promise<string | null> {
	const supabase = createServerClient(cookieStore); // Use your custom server client
	try {
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();
		if (userError || !user) return null;

		// Assuming you have a way to verify if the user is a teacher,
		// e.g., checking a 'profiles' table or custom claims. Adjust as needed.
        // For simplicity, let's assume getUser confirms an authenticated user exists.
        // We'll rely on RLS policies on the 'students' table for authorization.
        // The insert will fail if the user doesn't have permission based on teacher_id.
		return user.id;
	} catch (error) {
		console.error('Error fetching teacher user:', error);
		return null;
	}
}

// Header Transformation for PapaParse
const headerTransform = (header: string): keyof StudentCsvRow | string => {
    const lowerHeader = header.trim().toLowerCase();
    if (lowerHeader.includes('이름')) return '이름';
    if (lowerHeader.includes('학번')) return '학번';
    if (lowerHeader.includes('비밀번호')) return '비밀번호';
    if (lowerHeader.includes('클래스') || lowerHeader.includes('반')) return '클래스';
    return header; // Keep original if no match
}

export async function POST(request: NextRequest) {
	const cookieStore = cookies();
	const supabase = createServerClient(cookieStore); // Use your custom server client

	// 1. Verify teacher authentication
	const teacherId = await getTeacherId(cookieStore);
	if (!teacherId) {
		return NextResponse.json({ error: '인증되지 않았거나 교사 정보를 가져올 수 없습니다.' }, { status: 401 });
	}

	// 2. Get file from request (FormData)
	let formData;
	try {
		formData = await request.formData();
	} catch (e) {
		return NextResponse.json({ error: '잘못된 요청 형식입니다. FormData가 필요합니다.' }, { status: 400 });
	}
	const file = formData.get('file') as File | null;
	if (!file) {
		return NextResponse.json({ error: 'CSV 파일이 필요합니다.' }, { status: 400 });
	}
	if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
		console.warn(`Invalid file type uploaded: ${file.type} / ${file.name}`);
		return NextResponse.json({ error: '파일 형식이 올바르지 않습니다. CSV 파일만 업로드 가능합니다.' }, { status: 400 });
	}

	// 3. Read and parse CSV file content
	const csvText = await file.text();
	let parseResult: Papa.ParseResult<StudentCsvRow>;
	try {
		parseResult = Papa.parse<StudentCsvRow>(csvText, {
			header: true,
			skipEmptyLines: 'greedy', // More robust skipping
            transformHeader: headerTransform, // Use the transformation function
            encoding: "UTF-8", // Explicitly set encoding if needed
		});

		if (parseResult.errors.length > 0) {
            // Log only meta errors, data errors are handled row by row later
            const metaErrors = parseResult.errors.filter(e => e.type === 'FieldMismatch' || e.type === 'TooFewFields' || e.type === 'TooManyFields');
			if (metaErrors.length > 0) {
                console.error('CSV 파싱 오류 (메타):', metaErrors);
                return NextResponse.json({ error: 'CSV 파일 구조 오류 (헤더 또는 필드 수 불일치). 템플릿 파일을 확인하세요.', details: metaErrors }, { status: 400 });
            }
            // Continue processing even with row-specific errors, report them later
		}

		if (!parseResult.data || parseResult.data.length === 0) {
			return NextResponse.json({ error: 'CSV 파일에 처리할 데이터가 없습니다.' }, { status: 400 });
		}
	} catch (err) {
		console.error('CSV 파싱 중 예외 발생:', err);
		return NextResponse.json({ error: 'CSV 파일 처리 중 예외가 발생했습니다.' }, { status: 500 });
	}

    // 4. Process student data using admin client for bypass RLS during check/insert loop
    // !!! IMPORTANT: Ensure this service role key is highly protected !!!
    const supabaseAdmin = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use Service Role Key
        {
            auth: { autoRefreshToken: false, persistSession: false }
        }
    );

	let successCount = 0;
    const failures: { row: number; reason: string; data: any }[] = [];
    const studentsToInsert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at'>[] = [];

	// --- Validation and Preparation Loop ---
	for (let i = 0; i < parseResult.data.length; i++) {
		const row = parseResult.data[i];
		const rowNumber = i + 2; // +1 for 0-index, +1 for header row

        // Trim data
        const name = row.이름?.trim();
        const studentNumber = row.학번?.trim();
        const password = row.비밀번호?.trim(); // Keep optional for now
        const className = row.클래스?.trim() || null; // Allow null class names

		// Basic validation
		if (!name || !studentNumber) {
			failures.push({ row: rowNumber, reason: '필수 정보(이름, 학번) 누락', data: row });
			continue;
		}

        // Password generation (optional: if password is not provided)
        const finalPassword = password || Math.random().toString(36).slice(-8); // Generate random 8-char if missing

		// Hash password
		let hashedPassword;
		try {
			hashedPassword = await bcrypt.hash(finalPassword, BCRYPT_SALT_ROUNDS);
		} catch (hashError) {
			failures.push({ row: rowNumber, reason: '비밀번호 해싱 오류', data: row });
			continue;
		}

		studentsToInsert.push({
			teacher_id: teacherId,
			name: name,
			student_number: studentNumber,
			password: hashedPassword,
			class_name: className,
		});
	}

    // --- Bulk Insert/Upsert Attempt ---
    if (studentsToInsert.length > 0) {
        try {
            // Fetch existing student numbers for this teacher to check for duplicates efficiently
            const existingNumbers = new Set<string>();
            const { data: existingStudents, error: fetchError } = await supabaseAdmin
                .from('students')
                .select('student_number')
                .eq('teacher_id', teacherId);

            if (fetchError) {
                 console.error("Error fetching existing student numbers:", fetchError);
                 return NextResponse.json({ error: '기존 학생 정보 조회 중 오류 발생', details: fetchError.message }, { status: 500 });
            }
            existingStudents?.forEach(s => existingNumbers.add(s.student_number));

            const validStudentsForInsert: typeof studentsToInsert = [];
            // Re-check for duplicates before final insert list
            studentsToInsert.forEach((student, index) => {
                // Find original row number for error reporting
                const originalRowIndex = parseResult.data.findIndex(d => d.학번?.trim() === student.student_number && d.이름?.trim() === student.name);
                const rowNumber = originalRowIndex !== -1 ? originalRowIndex + 2 : index + 2; // Best guess if not found

                if (existingNumbers.has(student.student_number)) {
                    failures.push({ row: rowNumber, reason: '이미 존재하는 학번입니다.', data: parseResult.data[originalRowIndex] ?? student });
                } else {
                    validStudentsForInsert.push(student);
                    existingNumbers.add(student.student_number); // Add to set to prevent duplicate inserts within the same CSV
                }
            });


            if (validStudentsForInsert.length > 0) {
                 // Use upsert? Or just insert? Let's use insert and rely on the duplicate check above.
                 // RLS should prevent inserting with wrong teacher_id if not using admin client
                const { error: insertError, count } = await supabaseAdmin
                    .from('students')
                    .insert(validStudentsForInsert)
                    .select({ count: 'exact' }); // Get count of successfully inserted rows

                if (insertError) {
                    console.error('학생 정보 일괄 추가 오류:', insertError);
                    // Add a generic failure message - specific failures already logged above
                    failures.push({ row: 0, reason: `DB 저장 중 오류 발생: ${insertError.message}. 일부 학생만 추가되었을 수 있습니다.`, data: {} });
                    successCount = count ?? 0; // Use the count reported by Supabase if available
                } else {
                    successCount = count ?? validStudentsForInsert.length; // Assume all succeeded if no error and count is null
                }
            }

        } catch (err: any) {
            console.error('학생 정보 일괄 처리 중 예외 발생:', err);
            failures.push({ row: 0, reason: `처리 중 예외 발생: ${err.message || err}`, data: {} });
            // 예외 발생 시 successCount를 0으로 설정하거나 유지할지 결정 필요 (현재는 유지)
        }
    }

	// 5. Return summary
	return NextResponse.json({
		message: 'CSV 처리 완료.',
		successCount: successCount,
		failureCount: failures.length,
		failures: failures
	}, { status: failures.length > 0 && successCount === 0 ? 400 : 200 }); // Return 400 if all rows failed
}
