import React from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClassManagementClient from './ClassManagementClient'; // 클라이언트 컴포넌트 임포트
import { verifyTeacherRole } from '@/lib/authUtils';

export default async function ClassesPage() {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        redirect('/auth/login'); // 로그인되지 않았으면 로그인 페이지로
    }

    // 교사 역할 확인
    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
        // 교사가 아니면 접근 거부 또는 다른 페이지로 리디렉션
        // 여기서는 간단히 빈 페이지 또는 에러 메시지를 표시할 수 있습니다.
        // 혹은 교사 대시보드 홈으로 리디렉션할 수도 있습니다.
        // redirect('/teacher/dashboard');
         return (
            <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                <p>You do not have permission to view this page.</p>
            </div>
        );
    }

    // 초기 데이터 로딩 (선택적, 클라이언트에서 로드할 수도 있음)
    // 예: 초기 클래스 목록
    const { data: initialClasses, error: classError } = await supabase
        .from('classes') // 실제 클래스 테이블명 확인 필요
        .select('*')
        .eq('teacher_id', user.id)
        .order('name', { ascending: true });

    // 예: 초기 학생 목록
     const { data: initialStudents, error: studentError } = await supabase
        .from('students')
        .select('id, name, student_number, class_name')
        .eq('teacher_id', user.id)
        .order('name', { ascending: true });


    if (classError) {
        console.error('Error fetching initial classes:', classError);
        // 에러 처리 (예: 에러 페이지 표시)
    }
    if (studentError) {
         console.error('Error fetching initial students:', studentError);
         // 에러 처리
    }

    return (
        <ClassManagementClient
            userId={user.id}
            initialClasses={initialClasses || []}
            initialStudents={initialStudents || []}
        />
    );
} 