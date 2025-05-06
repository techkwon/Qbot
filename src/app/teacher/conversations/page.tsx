'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge'; // 상태 표시용 (선택)
import { Button } from '@/components/ui/button'; // 상세 보기 버튼

// API 응답 타입 정의
interface Student {
    name: string;
    student_number: string;
    class_name: string;
}

interface Chatbot {
    name: string;
}

interface ConversationSession {
    id: string; // student_session ID
    start_time: string;
    end_time?: string | null;
    students: Student | null;
    chatbots: Chatbot | null;
}

export default function TeacherConversationsPage() {
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchConversations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/teacher/conversations');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data: ConversationSession[] = await response.json();
            setSessions(data);
        } catch (err: any) {
            console.error('Failed to fetch conversations:', err);
            setError(err.message || '대화 목록을 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Student Conversations</h1>

            {isLoading && <p>Loading conversations...</p>}
            {error && <p className="text-red-500 mb-4">Error: {error}</p>}

            {!isLoading && !error && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Chatbot</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Started At</TableHead>
                            <TableHead>Ended At</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sessions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-gray-500 py-4">
                                    No conversations found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            sessions.map((session) => (
                                <TableRow key={session.id}>
                                    <TableCell>{session.students?.name ?? 'N/A'} ({session.students?.student_number ?? 'N/A'})</TableCell>
                                    <TableCell>{session.chatbots?.name ?? 'N/A'}</TableCell>
                                    <TableCell>{session.students?.class_name ?? 'N/A'}</TableCell>
                                    <TableCell>{format(new Date(session.start_time), 'yyyy-MM-dd HH:mm')}</TableCell>
                                    <TableCell>{session.end_time ? format(new Date(session.end_time), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={session.end_time ? 'secondary' : 'default'}>
                                            {session.end_time ? 'Completed' : 'In Progress'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/teacher/conversations/${session.id}`} passHref>
                                             <Button variant="outline" size="sm">View Details</Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
