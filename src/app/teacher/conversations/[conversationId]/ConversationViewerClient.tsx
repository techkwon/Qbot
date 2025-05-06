'use client';

import React, { useState, useEffect } from 'react';
import { Message } from 'ai';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ThumbsUpIcon, ThumbsDownIcon, SparklesIcon } from '@heroicons/react/24/outline'; // 아이콘 추가

// Props 타입 정의 (서버 컴포넌트에서 전달받는 데이터)
interface StudentInfo {
    id: string;
    name: string;
    student_number: string;
    class_name: string;
}

interface SessionData {
    id: string;
    chatbotId: string;
    student: StudentInfo | null;
}

interface MessageData extends Message {
    id: string;
    sender: 'student' | 'bot';
    message: string;
    image_url?: string | null;
    is_voice_input?: boolean | null;
    created_at: string;
}

interface LearningGoal {
    id: string;
    goal_text: string;
}

interface GoalResponse {
    goal_id: string;
    checked_by_student: boolean | null;
    evaluated_by_ai: boolean | null;
    evaluation_comment: string | null;
}

interface ConversationViewerClientProps {
    conversationId: string;
    initialSessionData: SessionData;
    initialMessages: MessageData[];
    initialLearningGoals: LearningGoal[];
    initialGoalResponses: GoalResponse[];
    chatbotName: string | null;
}

// AI 평가 결과 타입
interface AIEvaluation {
    goalId: string;
    achieved: boolean;
    reason: string;
}

export default function ConversationViewerClient({
    conversationId,
    initialSessionData,
    initialMessages,
    initialLearningGoals,
    initialGoalResponses,
    chatbotName
}: ConversationViewerClientProps) {
    const [sessionData] = useState<SessionData>(initialSessionData);
    const [messages] = useState<MessageData[]>(initialMessages);
    const [learningGoals] = useState<LearningGoal[]>(initialLearningGoals);
    const [goalResponses, setGoalResponses] = useState<GoalResponse[]>(initialGoalResponses);
    const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
    const [evaluationError, setEvaluationError] = useState<string | null>(null);

    // 목표 ID를 키로 응답 데이터를 빠르게 조회하기 위한 맵
    const goalResponseMap = new Map<string, GoalResponse>();
    goalResponses.forEach(res => goalResponseMap.set(res.goal_id, res));

    const handleEvaluate = async () => {
        setIsEvaluating(true);
        setEvaluationError(null);
        try {
            const response = await fetch('/api/ai/evaluate-goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: conversationId }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to start AI evaluation.');
            }

            // 평가 완료 후 결과 상태 업데이트 (API 응답 직접 사용 또는 DB 재조회)
            // 여기서는 API 응답을 사용하여 즉시 UI 업데이트
            if (result.evaluations && Array.isArray(result.evaluations)) {
                const newResponses = [...goalResponses]; // 기존 응답 복사
                result.evaluations.forEach((evaluation: AIEvaluation) => {
                    const existingIndex = newResponses.findIndex(r => r.goal_id === evaluation.goalId);
                    if (existingIndex > -1) {
                        // 기존 응답 업데이트
                        newResponses[existingIndex] = {
                            ...newResponses[existingIndex],
                            evaluated_by_ai: evaluation.achieved,
                            evaluation_comment: evaluation.reason,
                        };
                    } else {
                        // 새 응답 추가 (학생이 체크 안 한 경우)
                        newResponses.push({
                            goal_id: evaluation.goalId,
                            checked_by_student: null,
                            evaluated_by_ai: evaluation.achieved,
                            evaluation_comment: evaluation.reason,
                        });
                    }
                });
                setGoalResponses(newResponses); // 상태 업데이트
                toast.success('AI evaluation completed successfully!');
            } else {
                 throw new Error('Invalid evaluation data received from API.');
            }

        } catch (error: any) {
            console.error('Error during AI evaluation:', error);
            setEvaluationError(error.message || 'An unknown error occurred during evaluation.');
            toast.error(`AI Evaluation Failed: ${error.message}`);
        } finally {
            setIsEvaluating(false);
        }
    };

    const studentInfo = sessionData.student ? `${sessionData.student.name} (${sessionData.student.student_number}, ${sessionData.student.class_name})` : 'Unknown Student';

    return (
        <div className="container mx-auto p-4 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold mb-1">Conversation Details</h1>
                <p className="text-sm text-gray-600">Student: {studentInfo}</p>
                {chatbotName && <p className="text-sm text-gray-600">Chatbot: {chatbotName}</p>}
            </div>

            {/* Main Content Area (Messages + Evaluation) */}
            <div className="grid md:grid-cols-3 gap-6">
                {/* Conversation Messages (Left/Main Column) */} 
                <div className="md:col-span-2 border rounded-lg p-4 space-y-4 bg-white max-h-[75vh] overflow-y-auto">
                    {messages.length === 0 ? (
                        <p className="text-center text-gray-500">No messages in this conversation yet.</p>
                    ) : (
                        messages.map((msg, index) => (
                            <div key={msg.id || index} className={`flex ${msg.sender === 'student' ? 'justify-start' : 'justify-end'}`}>
                                <div
                                    className={`max-w-[85%] p-3 rounded-lg shadow-sm ${msg.sender === 'student'
                                            ? 'bg-gray-100 text-gray-800'
                                            : 'bg-blue-100 text-blue-900' // Adjusted bot color
                                        }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{msg.message || msg.content}</p>
                                    {msg.image_url && (
                                        <div className="mt-2">
                                            {/* TODO: Use signed URL for image if needed */}
                                            {/* Assuming direct URL for now */}
                                            <img src={msg.image_url} alt="Uploaded by student" className="max-w-xs max-h-48 rounded cursor-pointer" onClick={() => window.open(msg.image_url || '', '_blank')} />
                                        </div>
                                    )}
                                    <p className="text-xs text-right mt-1 opacity-60">
                                        {format(new Date(msg.created_at || msg.createdAt), 'yy-MM-dd HH:mm')}
                                        {msg.is_voice_input && ' (Voice)'}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Learning Goals & Evaluation (Right Column) */} 
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Learning Goals & Evaluation</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {learningGoals.length === 0 ? (
                                <p className="text-sm text-gray-500">No learning goals defined for this chatbot.</p>
                            ) : (
                                learningGoals.map(goal => {
                                    const response = goalResponseMap.get(goal.id);
                                    return (
                                        <div key={goal.id} className="p-3 border rounded-md bg-gray-50">
                                            <p className="text-sm font-medium mb-2">{goal.goal_text}</p>
                                            <div className="flex justify-between items-center mb-1 text-xs">
                                                <span>Student Check:</span>
                                                {response?.checked_by_student === true && <Badge variant="success" className="text-xs">Achieved</Badge>}
                                                {response?.checked_by_student === false && <Badge variant="destructive" className="text-xs">Not Achieved</Badge>}
                                                {response?.checked_by_student === null || response?.checked_by_student === undefined && <Badge variant="outline" className="text-xs">Not Checked</Badge>}
                                            </div>
                                            <div className="flex justify-between items-center text-xs mb-2">
                                                <span>AI Evaluation:</span>
                                                {response?.evaluated_by_ai === true && <ThumbsUpIcon className="h-4 w-4 text-green-600" title={response.evaluation_comment || 'Achieved'} />}
                                                {response?.evaluated_by_ai === false && <ThumbsDownIcon className="h-4 w-4 text-red-600" title={response.evaluation_comment || 'Not Achieved'} />}
                                                {response?.evaluated_by_ai === null || response?.evaluated_by_ai === undefined && <Badge variant="outline" className="text-xs">Not Evaluated</Badge>}
                                            </div>
                                            {response?.evaluation_comment && (
                                                 <p className="text-xs text-gray-500 italic border-l-2 pl-2">
                                                     AI Reason: {response.evaluation_comment}
                                                 </p>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {learningGoals.length > 0 && (
                                <Button
                                    onClick={handleEvaluate}
                                    disabled={isEvaluating}
                                    className="w-full mt-4"
                                    size="sm"
                                >
                                    <SparklesIcon className="h-4 w-4 mr-2" />
                                    {isEvaluating ? 'Evaluating with AI...' : 'Run AI Evaluation'}
                                </Button>
                            )}
                            {evaluationError && <p className="text-red-500 text-xs mt-2">Error: {evaluationError}</p>}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
} 