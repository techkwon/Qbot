'use client';

import React, { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client'; // 클라이언트 컴포넌트용 Supabase 클라이언트
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import ReferenceFileManager from '@/components/teacher/ReferenceFileManager'; // ReferenceFileManager 임포트
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Select 컴포넌트 추가
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // RadioGroup 추가
import { Label } from "@/components/ui/label"; // Label 추가
import { TrashIcon } from '@heroicons/react/24/outline'; // 아이콘 추가

// 학습 목표 스키마 추가
const learningGoalSchema = z.object({
    id: z.string().optional(), // DB ID (업데이트 시 필요)
    goal_text: z.string().min(1, 'Goal text cannot be empty'),
    expected_keywords_string: z.string().optional(), // 콤마 구분 문자열로 입력 받음
});

// 챗봇 스키마에 학습 목표 추가
const chatbotSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Chatbot name is required'),
    description: z.string().optional(),
    base_prompt: z.string().min(1, 'Base prompt is required'),
    model: z.string().optional().default('gpt-3.5-turbo'),
    temperature: z.number().min(0).max(1).optional().default(0.7),
    allowed_classes: z.array(z.string()).optional().default([]),
    max_attempts: z.number().int().positive().nullable().optional(),
    custom_link_slug: z.string().optional().nullable(),
    learning_goals: z.array(learningGoalSchema).optional().default([]), // learning_goals 필드 추가
});

type ChatbotFormData = z.infer<typeof chatbotSchema>;

interface LearningGoalData {
    id?: string;
    goal_text: string;
    expected_keywords?: string[] | null; // DB에는 배열로 저장
}

interface Chatbot {
    id: string;
    created_at: string;
    name: string;
    description?: string | null;
    base_prompt: string;
    model: string;
    temperature: number;
    teacher_id: string;
    allowed_classes?: string[] | null;
    max_attempts?: number | null;
    custom_link_slug?: string | null;
    learning_goals?: LearningGoalData[] | null; // 챗봇 타입에도 추가
}

interface Student {
    id: string;
    name: string;
    student_number: string;
    class_name: string;
}

interface ChatbotManagementClientProps {
    initialChatbots: Chatbot[];
    userId: string;
}

const ChatbotManagementClient: React.FC<ChatbotManagementClientProps> = ({ initialChatbots, userId }) => {
    const [chatbots, setChatbots] = useState<Chatbot[]>(initialChatbots);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingChatbot, setEditingChatbot] = useState<Chatbot | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);
    const [teacherStudents, setTeacherStudents] = useState<Student[]>([]); // 학생 목록 상태 추가

    // AI 시나리오 생성 관련 상태 추가
    const [aiTopic, setAiTopic] = useState<string>('');
    const [isGeneratingScenario, setIsGeneratingScenario] = useState<boolean>(false);

    const supabase = createClient();

    const { register, handleSubmit, control, reset, formState: { errors }, watch, setValue } = useForm<ChatbotFormData>({
        resolver: zodResolver(chatbotSchema),
        defaultValues: {
            allowed_classes: [],
            max_attempts: null,
            custom_link_slug: null,
            learning_goals: [], // learning_goals 기본값 추가
        },
    });

    // useFieldArray 훅 사용
    const { fields: goalFields, append: appendGoal, remove: removeGoal } = useFieldArray({
        control,
        name: "learning_goals"
    });

    const fetchTeacherData = useCallback(async () => {
        // Fetch unique class names
        const { data: studentClasses, error: classError } = await supabase
            .from('students')
            .select('class_name')
            .eq('teacher_id', userId);

        if (classError) {
            console.error('Error fetching classes:', classError);
            toast.error('Failed to load class list.');
        } else if (studentClasses) {
            const uniqueClasses = Array.from(new Set(studentClasses.map(s => s.class_name).filter(Boolean))) as string[];
            setAvailableClasses(uniqueClasses);
        }

        // Fetch students
        const { data: studentsData, error: studentError } = await supabase
            .from('students')
            .select('id, name, student_number, class_name')
            .eq('teacher_id', userId);

         if (studentError) {
            console.error('Error fetching students:', studentError);
            toast.error('Failed to load student list.');
        } else if (studentsData) {
             setTeacherStudents(studentsData as Student[]);
        }
    }, [supabase, userId]);

    useEffect(() => {
        fetchTeacherData();
    }, [fetchTeacherData]);

    const fetchChatbots = useCallback(async () => {
        const { data, error } = await supabase
            .from('chatbots')
            .select('*')
            .eq('teacher_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching chatbots:', error);
            toast.error('Failed to load chatbots.');
        } else {
            setChatbots(data as Chatbot[]);
        }
    }, [supabase, userId]);

    useEffect(() => {
        fetchChatbots();
    }, [fetchChatbots]);

    // DB 데이터를 폼 데이터 형식으로 변환하는 함수
    const transformChatbotToFormData = (chatbot: Chatbot | null): ChatbotFormData => {
        if (!chatbot) {
            return {
                name: '',
                description: '',
                base_prompt: '',
                model: 'gpt-3.5-turbo',
                temperature: 0.7,
                allowed_classes: [],
                max_attempts: null,
                custom_link_slug: null,
                learning_goals: [],
            };
        }
        return {
            ...chatbot,
            max_attempts: chatbot.max_attempts ?? null,
            allowed_classes: chatbot.allowed_classes ?? [],
            custom_link_slug: chatbot.custom_link_slug ?? null,
            learning_goals: (chatbot.learning_goals ?? []).map(goal => ({
                id: goal.id, // DB id 유지
                goal_text: goal.goal_text,
                // DB의 키워드 배열을 콤마 구분 문자열로 변환
                expected_keywords_string: goal.expected_keywords?.join(', ') || '',
            })),
        };
    };

    // DB에서 학습 목표 데이터를 가져와 폼에 설정하는 로직 추가
    const fetchLearningGoalsForChatbot = useCallback(async (chatbotId: string) => {
        const { data, error } = await supabase
            .from('learning_goals')
            .select('id, goal_text, expected_keywords')
            .eq('chatbot_id', chatbotId);

        if (error) {
            console.error('Error fetching learning goals:', error);
            toast.error('Failed to load learning goals.');
            return [];
        } else {
            // 폼 데이터 형식으로 변환하여 반환
            return (data || []).map(goal => ({
                 id: goal.id,
                 goal_text: goal.goal_text,
                 expected_keywords_string: goal.expected_keywords?.join(', ') || ''
            }));
        }
    }, [supabase]);

    const openModal = async (chatbot: Chatbot | null = null) => {
        let formData = transformChatbotToFormData(chatbot);
        if (chatbot?.id) {
            // 기존 챗봇 수정 시 학습 목표 데이터 로드
             const goalsFormData = await fetchLearningGoalsForChatbot(chatbot.id);
            formData.learning_goals = goalsFormData;
        }

        setEditingChatbot(chatbot);
        reset(formData); // 변환된 데이터로 폼 리셋
        setAiTopic('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingChatbot(null);
        reset();
        setAiTopic('');
    };

    const onSubmit = async (data: ChatbotFormData) => {
        setIsSubmitting(true);
        // 폼 데이터의 learning_goals 를 DB 형식으로 변환
        const learningGoalsToSave = data.learning_goals?.map(goal => ({
            id: goal.id, // id가 있으면 업데이트, 없으면 생성 (백엔드에서 처리)
            goal_text: goal.goal_text,
            // 콤마 구분 문자열을 다시 배열로 변환 (공백 제거 및 빈 문자열 필터링)
            expected_keywords: goal.expected_keywords_string?.split(',').map(k => k.trim()).filter(Boolean) || [],
        })) || [];

        const chatbotData = {
            name: data.name,
            description: data.description,
            base_prompt: data.base_prompt,
            model: data.model,
            temperature: data.temperature,
            allowed_classes: data.allowed_classes,
            max_attempts: data.max_attempts ? Number(data.max_attempts) : null,
            custom_link_slug: data.custom_link_slug || null,
            teacher_id: userId,
            // learning_goals는 별도로 처리 (아래 참조)
        };

        try {
            let savedChatbotId = editingChatbot?.id;
            let responseError = null;

            if (editingChatbot?.id) {
                // 챗봇 기본 정보 업데이트
                const { error } = await supabase
                    .from('chatbots')
                    .update(chatbotData)
                    .eq('id', editingChatbot.id);
                responseError = error;
            } else {
                // 새 챗봇 생성 및 ID 가져오기
                const { data: newData, error } = await supabase
                    .from('chatbots')
                    .insert(chatbotData)
                    .select('id') // 새로 생성된 ID 가져오기
                    .single(); // 단일 레코드 반환
                responseError = error;
                if (newData) {
                    savedChatbotId = newData.id;
                }
            }

            if (responseError) throw responseError;
            if (!savedChatbotId) throw new Error('Failed to get chatbot ID after save.');

            // 학습 목표 처리 (Upsert)
            // 1. 기존 목표 ID 목록 가져오기
            const { data: existingGoals, error: existingGoalsError } = await supabase
                .from('learning_goals')
                .select('id')
                .eq('chatbot_id', savedChatbotId);
            if (existingGoalsError) throw existingGoalsError;
            const existingGoalIds = existingGoals?.map(g => g.id) || [];

            // 2. 저장할 목표 데이터 준비 (chatbot_id 추가)
            const goalsToUpsert = learningGoalsToSave.map(goal => ({
                ...goal,
                chatbot_id: savedChatbotId,
            }));

            // 3. Upsert 실행
            const { error: upsertError } = await supabase
                .from('learning_goals')
                .upsert(goalsToUpsert);
            if (upsertError) throw upsertError;

            // 4. 폼에서 삭제된 목표 DB에서 삭제
            const goalsToDelete = existingGoalIds.filter(id => !learningGoalsToSave.some(g => g.id === id));
            if (goalsToDelete.length > 0) {
                 const { error: deleteError } = await supabase
                    .from('learning_goals')
                    .delete()
                    .in('id', goalsToDelete);
                if (deleteError) {
                     // 삭제 오류는 일단 로그만 남기고 계속 진행 (부분 성공 처리)
                     console.error("Error deleting removed learning goals:", deleteError);
                     toast.warning('Some old learning goals might not have been deleted.');
                }
            }

            toast.success(editingChatbot ? 'Chatbot and learning goals updated successfully!' : 'Chatbot and learning goals created successfully!');
            fetchChatbots();
            closeModal();
        } catch (error: any) {
            console.error('Error saving chatbot:', error);
            // Check for specific Supabase unique constraint error (example)
            if (error.code === '23505' && error.message.includes('chatbots_custom_link_slug_key')) {
                 toast.error('Failed to save chatbot: Custom link slug is already in use.');
            } else {
                toast.error(`Failed to save chatbot: ${error.message}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteChatbot = async (id: string) => {
        if (!confirm('Are you sure you want to delete this chatbot?')) return;

        try {
            const { error } = await supabase.from('chatbots').delete().eq('id', id);
            if (error) throw error;
            toast.success('Chatbot deleted successfully!');
            fetchChatbots(); // Refresh the list
        } catch (error: any) {
            console.error('Error deleting chatbot:', error);
            toast.error(`Failed to delete chatbot: ${error.message}`);
        }
    };

    // --- Manage Attempts State and Handler ---
    const [resetScope, setResetScope] = useState<'chatbot' | 'class' | 'student'>('chatbot');
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [isResetting, setIsResetting] = useState(false);

    const handleResetAttempts = async () => {
        if (!editingChatbot) return;

        let payload: any = { scope: resetScope };
        if (resetScope === 'class') {
            if (!selectedClass) {
                toast.error('Please select a class to reset.');
                return;
            }
            payload.className = selectedClass;
        } else if (resetScope === 'student') {
            if (!selectedStudent) {
                toast.error('Please select a student to reset.');
                return;
            }
            payload.studentId = selectedStudent;
        }

        setIsResetting(true);
        try {
            const response = await fetch(`/api/teacher/chatbots/${editingChatbot.id}/manage-attempts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to reset attempts');
            }

            toast.success(`Attempts reset successfully for scope: ${resetScope}.`);
            // Reset selection after successful operation
            setSelectedClass('');
            setSelectedStudent('');

        } catch (error: any) {
            console.error('Error resetting attempts:', error);
            toast.error(`Failed to reset attempts: ${error.message}`);
        } finally {
            setIsResetting(false);
        }
    };
    // --- End Manage Attempts ---

    // AI 시나리오 생성 핸들러 추가
    const handleGenerateScenario = async () => {
        if (!aiTopic.trim() || aiTopic.trim().length < 10) {
            toast.error('Please enter a topic description (at least 10 characters) to generate a scenario.');
            return;
        }
        setIsGeneratingScenario(true);
        try {
            const response = await fetch('/api/ai/generate-scenario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: aiTopic }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to generate scenario');
            }
            // 생성된 프롬프트를 base_prompt 필드에 설정 (react-hook-form 사용)
            setValue('base_prompt', result.generatedPrompt, { shouldValidate: true });
            toast.success('AI scenario generated successfully and applied to Base Prompt.');
        } catch (error: any) {
            console.error('Error generating AI scenario:', error);
            toast.error(`Failed to generate scenario: ${error.message}`);
        } finally {
            setIsGeneratingScenario(false);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Manage Your Chatbots</h1>
            <Button onClick={() => openModal()}>Create New Chatbot</Button>

            <Table className="mt-4">
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Link Slug</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Classes</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {chatbots.map((chatbot) => (
                        <TableRow key={chatbot.id}>
                            <TableCell>{chatbot.name}</TableCell>
                            <TableCell>{chatbot.description ?? '-'}</TableCell>
                            <TableCell>
                                {chatbot.custom_link_slug ? (
                                    <a href={`/student/login/${chatbot.custom_link_slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        /student/login/{chatbot.custom_link_slug}
                                    </a>
                                ) : '-'}
                            </TableCell>
                            <TableCell>{chatbot.max_attempts ?? 'Unlimited'}</TableCell>
                            <TableCell>{chatbot.allowed_classes?.join(', ') || 'All'}</TableCell>
                            <TableCell>
                                <Button variant="outline" size="sm" onClick={() => openModal(chatbot)} className="mr-2">Edit</Button>
                                <Button variant="destructive" size="sm" onClick={() => deleteChatbot(chatbot.id)}>Delete</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {isModalOpen && (
                <Dialog open={isModalOpen} onOpenChange={closeModal}>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingChatbot ? 'Edit Chatbot' : 'Create New Chatbot'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                                <Input id="name" {...register('name')} />
                                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                            </div>
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                                <Textarea id="description" {...register('description')} />
                            </div>
                             <div>
                                <label htmlFor="custom_link_slug" className="block text-sm font-medium text-gray-700">Custom Link Slug (Optional)</label>
                                <Input id="custom_link_slug" {...register('custom_link_slug')} placeholder="e.g., history-101-quiz" />
                                {errors.custom_link_slug && <p className="text-red-500 text-xs mt-1">{errors.custom_link_slug.message}</p>}
                            </div>
                            <div>
                                <label htmlFor="aiTopic" className="block text-sm font-medium text-gray-700">Describe Topic/Goal for AI Scenario Generation</label>
                                <Textarea
                                    id="aiTopic"
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    rows={3}
                                    placeholder="e.g., Explain the water cycle for 5th graders, focusing on evaporation and condensation."
                                    className="mt-1"
                                />
                                <Button
                                    type="button"
                                    onClick={handleGenerateScenario}
                                    disabled={isGeneratingScenario || !aiTopic.trim() || aiTopic.trim().length < 10}
                                    className="mt-2"
                                >
                                    {isGeneratingScenario ? 'Generating...' : 'Generate Scenario with AI'}
                                </Button>
                            </div>
                            <div>
                                <label htmlFor="base_prompt" className="block text-sm font-medium text-gray-700">Base Prompt</label>
                                <Textarea id="base_prompt" {...register('base_prompt')} rows={5} />
                                {errors.base_prompt && <p className="text-red-500 text-xs mt-1">{errors.base_prompt.message}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="model" className="block text-sm font-medium text-gray-700">Model</label>
                                    <Input id="model" {...register('model')} defaultValue="gpt-3.5-turbo" />
                                    {errors.model && <p className="text-red-500 text-xs mt-1">{errors.model.message}</p>}
                                </div>
                                <div>
                                    <label htmlFor="temperature" className="block text-sm font-medium text-gray-700">Temperature</label>
                                    <Input id="temperature" type="number" step="0.1" {...register('temperature', { valueAsNumber: true })} />
                                    {errors.temperature && <p className="text-red-500 text-xs mt-1">{errors.temperature.message}</p>}
                                </div>
                            </div>
                            <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Classes (Optional - leave empty for all)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {availableClasses.map(className => (
                                        <div key={className} className="flex items-center space-x-2">
                                             <Controller
                                                name="allowed_classes"
                                                control={control}
                                                render={({ field }) => (
                                                    <Checkbox
                                                        id={`class-${className}`}
                                                        checked={field.value?.includes(className)}
                                                        onCheckedChange={(checked) => {
                                                            const currentValues = field.value ?? [];
                                                            return checked
                                                                ? field.onChange([...currentValues, className])
                                                                : field.onChange(currentValues.filter(value => value !== className));
                                                        }}
                                                    />
                                                )}
                                            />
                                            <label htmlFor={`class-${className}`}>{className}</label>
                                        </div>
                                    ))}
                                </div>
                                {errors.allowed_classes && <p className="text-red-500 text-xs mt-1">{errors.allowed_classes.message}</p>}
                            </div>
                             <div>
                                <label htmlFor="max_attempts" className="block text-sm font-medium text-gray-700">Total Usage Attempts (Optional - leave empty for unlimited)</label>
                                <Input id="max_attempts" type="number" {...register('max_attempts', { setValueAs: (v) => v === '' || v === null ? null : parseInt(v, 10) })} placeholder="e.g., 3" />
                                {errors.max_attempts && <p className="text-red-500 text-xs mt-1">{errors.max_attempts.message}</p>}
                            </div>

                            {/* Reference File Manager */}
                            {editingChatbot && (
                                <div className="border-t pt-4 mt-4">
                                     <h3 className="text-lg font-semibold mb-2">Reference Materials</h3>
                                    <ReferenceFileManager chatbotId={editingChatbot.id} teacherId={userId} />
                                </div>
                            )}

                           {/* --- Manage Attempts Section --- */}
                           {editingChatbot && (
                                <div className="border-t pt-4 mt-4 space-y-4">
                                    <h3 className="text-lg font-semibold mb-2">Manage Student Attempts</h3>
                                    <RadioGroup value={resetScope} onValueChange={(value) => setResetScope(value as any)} className="flex space-x-4">
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="chatbot" id="scope-chatbot" />
                                            <Label htmlFor="scope-chatbot">All Students (Chatbot)</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="class" id="scope-class" />
                                            <Label htmlFor="scope-class">Specific Class</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="student" id="scope-student" />
                                            <Label htmlFor="scope-student">Specific Student</Label>
                                        </div>
                                    </RadioGroup>

                                    {resetScope === 'class' && (
                                        <div>
                                            <Label htmlFor="select-class">Select Class</Label>
                                            <Select value={selectedClass} onValueChange={setSelectedClass}>
                                                <SelectTrigger id="select-class">
                                                    <SelectValue placeholder="Select a class..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableClasses.map(cls => (
                                                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {resetScope === 'student' && (
                                         <div>
                                             <Label htmlFor="select-student">Select Student</Label>
                                            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                                                <SelectTrigger id="select-student">
                                                    <SelectValue placeholder="Select a student..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {teacherStudents.map(std => (
                                                        <SelectItem key={std.id} value={std.id}>{std.name} ({std.student_number}) - {std.class_name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    <Button type="button" onClick={handleResetAttempts} disabled={isResetting}>
                                        {isResetting ? 'Resetting...' : 'Reset Attempts'}
                                    </Button>
                                </div>
                            )}
                            {/* --- End Manage Attempts Section --- */} 

                            {/* --- Learning Goals Section --- */}
                            <div className="space-y-3 p-4 border rounded-md">
                                <h3 className="text-lg font-medium mb-2">Learning Goals</h3>
                                {goalFields.map((field, index) => (
                                    <div key={field.id} className="flex items-start gap-2 p-3 border rounded bg-white shadow-sm">
                                        <div className="flex-grow space-y-1">
                                            <Label htmlFor={`learning_goals.${index}.goal_text`} className="text-xs font-semibold">Goal #{index + 1}</Label>
                                            <Textarea
                                                id={`learning_goals.${index}.goal_text`}
                                                {...register(`learning_goals.${index}.goal_text`)}
                                                placeholder="Enter the learning goal description"
                                                rows={2}
                                                className="text-sm"
                                                aria-invalid={errors.learning_goals?.[index]?.goal_text ? "true" : "false"}
                                            />
                                            {errors.learning_goals?.[index]?.goal_text && (
                                                <p className="text-red-500 text-xs">{errors.learning_goals[index]?.goal_text?.message}</p>
                                            )}
                                             <Label htmlFor={`learning_goals.${index}.expected_keywords_string`} className="text-xs">Expected Keywords (Optional, comma-separated)</Label>
                                            <Input
                                                id={`learning_goals.${index}.expected_keywords_string`}
                                                {...register(`learning_goals.${index}.expected_keywords_string`)}
                                                placeholder="e.g., mitochondria, ATP, cellular respiration"
                                                className="text-sm"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => removeGoal(index)}
                                            variant="ghost"
                                            size="icon"
                                            className="mt-5 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            aria-label="Remove goal"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    onClick={() => appendGoal({ goal_text: '', expected_keywords_string: '' })}
                                    variant="outline"
                                    size="sm"
                                >
                                    + Add Learning Goal
                                </Button>
                            </div>

                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline" disabled={isSubmitting || isGeneratingScenario}>Cancel</Button>
                                </DialogClose>
                                <Button type="submit" disabled={isSubmitting || isGeneratingScenario}>
                                    {isSubmitting ? (editingChatbot ? 'Updating...' : 'Creating...') : (editingChatbot ? 'Save Changes' : 'Create Chatbot')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default ChatbotManagementClient;
