'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TrashIcon, UsersIcon } from '@heroicons/react/24/outline';

// 데이터 타입 정의
interface ClassData {
    id: string;
    name: string;
    teacher_id: string;
    created_at: string;
    // 필요하다면 클래스에 속한 학생 수를 직접 포함할 수도 있음
}

interface StudentData {
    id: string;
    name: string;
    student_number: string;
    class_name: string | null; // 학생이 속한 클래스 이름 (null 가능)
}

interface ClassManagementClientProps {
    userId: string;
    initialClasses: ClassData[];
    initialStudents: StudentData[];
}

export default function ClassManagementClient({ userId, initialClasses, initialStudents }: ClassManagementClientProps) {
    const [classes, setClasses] = useState<ClassData[]>(initialClasses);
    const [students, setStudents] = useState<StudentData[]>(initialStudents);
    const [isLoading, setIsLoading] = useState<boolean>(false); // 통합 로딩 상태
    const [error, setError] = useState<string | null>(null);

    // 새 클래스 생성 관련 상태
    const [newClassName, setNewClassName] = useState<string>('');
    const [isCreatingClass, setIsCreatingClass] = useState<boolean>(false);

    // 학생 배정 관련 상태
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [targetClassName, setTargetClassName] = useState<string>(''); // 배정할 클래스 이름
    const [isAssigningStudents, setIsAssigningStudents] = useState<boolean>(false);

    // 클래스 삭제 로딩 상태
    const [deletingClassId, setDeletingClassId] = useState<string | null>(null);

    const supabase = createClient();

    // 데이터 새로고침 함수
    const refreshData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [classRes, studentRes] = await Promise.all([
                supabase.from('classes').select('*').eq('teacher_id', userId).order('name', { ascending: true }),
                supabase.from('students').select('id, name, student_number, class_name').eq('teacher_id', userId).order('name', { ascending: true })
            ]);

            if (classRes.error) throw new Error(`Failed to fetch classes: ${classRes.error.message}`);
            if (studentRes.error) throw new Error(`Failed to fetch students: ${studentRes.error.message}`);

            setClasses(classRes.data || []);
            setStudents(studentRes.data || []);

        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [supabase, userId]);

    // 컴포넌트 마운트 시 초기 데이터 확인 (이미 props로 받았으므로 필요 없을 수 있음)
    // useEffect(() => {
    //     // Optional: Refresh data on mount if needed, or rely on initialProps
    // }, [refreshData]);

    // 클래스별 학생 목록 계산 (Memoization)
    const studentsByClass = useMemo(() => {
        const map = new Map<string, StudentData[]>();
        classes.forEach(cls => map.set(cls.name, [])); // 모든 클래스에 대해 빈 배열 초기화
        students.forEach(std => {
            if (std.class_name) {
                const list = map.get(std.class_name);
                if (list) {
                    list.push(std);
                }
                // 클래스 목록에 없는 클래스명은 무시하거나, 별도 처리 가능
            }
        });
        return map;
    }, [classes, students]);

    // 미배정 학생 목록 계산 (Memoization)
    const unassignedStudents = useMemo(() => {
        return students.filter(std => !std.class_name);
    }, [students]);

    // 새 클래스 생성 핸들러
    const handleCreateClass = async (e: FormEvent) => {
        e.preventDefault();
        const trimmedName = newClassName.trim();
        if (!trimmedName) {
            toast.error('Class name cannot be empty.');
            return;
        }
        // 중복 이름 체크 (선택적)
        if (classes.some(cls => cls.name === trimmedName)) {
             toast.error(`Class "${trimmedName}" already exists.`);
             return;
        }

        setIsCreatingClass(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('classes')
                .insert({ name: trimmedName, teacher_id: userId })
                .select()
                .single(); // 생성된 클래스 데이터 받기

            if (error) throw error;

            toast.success(`Class "${data.name}" created successfully!`);
            setNewClassName('');
            refreshData(); // 목록 새로고침

        } catch (err: any) {
            setError(err.message);
            toast.error(`Failed to create class: ${err.message}`);
        } finally {
            setIsCreatingClass(false);
        }
    };

    // 학생 선택/해제 핸들러
    const handleStudentSelect = (studentId: string, isSelected: boolean) => {
        setSelectedStudentIds(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(studentId);
            } else {
                newSet.delete(studentId);
            }
            return newSet;
        });
    };

    // 학생 배정 핸들러
    const handleAssignStudents = async () => {
        if (selectedStudentIds.size === 0) {
            toast.warning('Please select students to assign.');
            return;
        }
        if (!targetClassName) {
            toast.warning('Please select a target class.');
            return;
        }

        setIsAssigningStudents(true);
        setError(null);
        const studentIdsToAssign = Array.from(selectedStudentIds);

        try {
            // Supabase는 여러 행 업데이트를 단일 요청으로 직접 지원하지 않음 (Row Level Security 등 고려).
            // 각 학생에 대해 개별 업데이트 또는 function 사용 필요. 여기서는 개별 업데이트 예시.
            const updatePromises = studentIdsToAssign.map(studentId =>
                supabase
                    .from('students')
                    .update({ class_name: targetClassName })
                    .eq('id', studentId)
                    .eq('teacher_id', userId) // 보안: 교사 본인의 학생만 수정 가능하도록
            );

            const results = await Promise.allSettled(updatePromises);

            const failedUpdates = results.filter(res => res.status === 'rejected');
            if (failedUpdates.length > 0) {
                console.error('Some student assignments failed:', failedUpdates);
                throw new Error(`${failedUpdates.length} student(s) could not be assigned. Check console for details.`);
            }

            toast.success(`${studentIdsToAssign.length} student(s) successfully assigned to class "${targetClassName}".`);
            setSelectedStudentIds(new Set()); // 선택 해제
            setTargetClassName(''); // 대상 클래스 초기화
            refreshData(); // 데이터 새로고침

        } catch (err: any) {
            setError(err.message);
            toast.error(`Failed to assign students: ${err.message}`);
        } finally {
            setIsAssigningStudents(false);
        }
    };

    // 클래스 삭제 핸들러
    const handleDeleteClass = async (classId: string, className: string) => {
        const studentsInClass = studentsByClass.get(className) || [];
        if (studentsInClass.length > 0) {
            if (!confirm(`Class "${className}" has ${studentsInClass.length} student(s) assigned. Deleting the class will unassign these students. Are you sure you want to delete this class?`)) {
                return;
            }
        } else {
             if (!confirm(`Are you sure you want to delete the class "${className}"?`)) {
                return;
            }
        }

        setDeletingClassId(classId);
        setError(null);

        try {
             // 트랜잭션이 이상적이지만, Supabase 클라이언트에서 직접 지원은 제한적.
             // 1. 학생들의 class_name 을 null 로 업데이트
             if (studentsInClass.length > 0) {
                 const studentIds = studentsInClass.map(s => s.id);
                 const { error: unassignError } = await supabase
                     .from('students')
                     .update({ class_name: null })
                     .in('id', studentIds)
                     .eq('teacher_id', userId); // 보안
                 if (unassignError) throw new Error(`Failed to unassign students before deleting class: ${unassignError.message}`);
             }

             // 2. 클래스 삭제
             const { error: deleteError } = await supabase
                 .from('classes')
                 .delete()
                 .eq('id', classId)
                 .eq('teacher_id', userId); // 보안

             if (deleteError) throw deleteError;

             toast.success(`Class "${className}" deleted successfully.`);
             refreshData(); // 목록 새로고침

        } catch (err: any) {
            setError(err.message);
            toast.error(`Failed to delete class: ${err.message}`);
             // 롤백 로직이 필요할 수 있음 (예: 학생 재배정 시도 등)
        } finally {
            setDeletingClassId(null);
        }
    };


    return (
        <div className="container mx-auto p-4 lg:p-6 space-y-6">
            <h1 className="text-3xl font-bold">Class Management</h1>

            {error && <p className="text-red-500 p-3 bg-red-50 border border-red-200 rounded">Error: {error}</p>}

            {/* 1. Create New Class */}
            <Card>
                <CardHeader>
                    <CardTitle>Create New Class</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreateClass} className="flex items-center gap-2">
                        <Input
                            type="text"
                            value={newClassName}
                            onChange={(e) => setNewClassName(e.target.value)}
                            placeholder="New class name (e.g., Grade 3 - Section A)"
                            disabled={isCreatingClass}
                            required
                            className="flex-grow"
                        />
                        <Button type="submit" disabled={isCreatingClass || !newClassName.trim()}>
                            {isCreatingClass ? 'Creating...' : 'Create Class'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* 2. Assign Students */}
            <Card>
                <CardHeader>
                    <CardTitle>Assign Students to Class</CardTitle>
                    <CardDescription>Select unassigned students and choose a target class.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Unassigned Student List */}
                    <div className="border rounded-lg p-4 max-h-80 overflow-y-auto">
                        <h4 className="font-semibold mb-2">Unassigned Students ({unassignedStudents.length})</h4>
                        {unassignedStudents.length === 0 ? (
                            <p className="text-sm text-gray-500">No unassigned students.</p>
                        ) : (
                            <ul className="space-y-2">
                                {unassignedStudents.map(student => (
                                    <li key={student.id} className="flex items-center space-x-2 text-sm">
                                        <Checkbox
                                            id={`assign-${student.id}`}
                                            checked={selectedStudentIds.has(student.id)}
                                            onCheckedChange={(checked) => handleStudentSelect(student.id, !!checked)}
                                        />
                                        <label htmlFor={`assign-${student.id}`} className="cursor-pointer">
                                            {student.name} ({student.student_number})
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                     {/* Target Class Selection & Action */}
                    <div className="space-y-4">
                        <Select
                            value={targetClassName}
                            onValueChange={setTargetClassName}
                            disabled={classes.length === 0 || selectedStudentIds.size === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select target class..." />
                            </SelectTrigger>
                            <SelectContent>
                                {classes.map(cls => (
                                    <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={handleAssignStudents}
                            disabled={isAssigningStudents || selectedStudentIds.size === 0 || !targetClassName}
                            className="w-full"
                        >
                            {isAssigningStudents ? 'Assigning...' : `Assign ${selectedStudentIds.size} Student(s) to "${targetClassName || '...'}"`}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Class List & Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Manage Classes</CardTitle>
                     <CardDescription>View students in each class and manage classes.</CardDescription>
                </CardHeader>
                <CardContent>
                     {isLoading && <p>Loading data...</p>}
                     {!isLoading && classes.length === 0 && (
                        <p className="text-center text-gray-500 py-4">No classes created yet.</p>
                     )}
                     {!isLoading && classes.length > 0 && (
                        <Accordion type="single" collapsible className="w-full">
                            {classes.map(cls => {
                                const studentsInThisClass = studentsByClass.get(cls.name) || [];
                                const isDeleting = deletingClassId === cls.id;
                                return (
                                    <AccordionItem value={cls.id} key={cls.id}>
                                        <AccordionTrigger className="hover:no-underline px-4">
                                            <div className="flex justify-between items-center w-full pr-4">
                                                <span className="font-medium text-lg">{cls.name}</span>
                                                <div className="flex items-center space-x-3">
                                                     <span className="text-sm text-gray-500 flex items-center">
                                                         <UsersIcon className="h-4 w-4 mr-1" /> {studentsInThisClass.length} Student(s)
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls.id, cls.name); }}
                                                        disabled={isDeleting}
                                                        className="text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                                                    >
                                                         {isDeleting ? 'Deleting...' : <TrashIcon className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-4 pb-4">
                                            {studentsInThisClass.length === 0 ? (
                                                <p className="text-sm text-gray-500 italic">No students assigned to this class yet.</p>
                                            ) : (
                                                <ul className="list-disc pl-5 space-y-1 text-sm">
                                                    {studentsInThisClass.map(std => (
                                                        <li key={std.id}>
                                                            {std.name} ({std.student_number})
                                                             {/* TODO: Add button to unassign individual student? */}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                     )}
                </CardContent>
            </Card>
        </div>
    );
} 