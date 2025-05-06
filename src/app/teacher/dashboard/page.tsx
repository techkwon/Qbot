'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client'; // 클라이언트 컴포넌트용 Supabase 클라이언트 추가
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Label as RechartsLabel, // Recharts 라벨 이름 충돌 방지
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, MessageCircle, Users, Target } from 'lucide-react'; // 아이콘 추가
import { Skeleton } from "@/components/ui/skeleton"; // Skeleton 추가

// API 응답 데이터 타입 (백엔드 API와 일치해야 함)
interface ChatbotStat {
    id: string;
    name: string;
    participantCount: number;
    sessionCount: number;
    averageStudentAchievementRate: number;
}

interface GoalStat {
    goalText: string;
    total: number;
    achieved: number;
    achievementRate: number;
}

interface DashboardData {
    chatbotStats: ChatbotStat[];
    goalStats: GoalStat[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

// 라벨 커스터마이징 (파이 차트용)
const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // 작은 퍼센트는 표시하지 않음 (옵션)
    if (percent * 100 < 5) return null;

    return (
        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10">
            {`${name} (${(percent * 100).toFixed(0)}%)`}
        </text>
    );
};

export default function TeacherDashboardPage() {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [totalStudents, setTotalStudents] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient(); // Supabase 클라이언트 초기화

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 여러 데이터를 병렬로 가져오기
            const [dashboardRes, studentsRes] = await Promise.all([
                fetch('/api/teacher/dashboard/feedback'),
                 supabase.from('students').select('id', { count: 'exact', head: true })
                 // 현재 로그인한 교사의 학생만 카운트하도록 RLS 설정 가정
            ]);

            if (!dashboardRes.ok) {
                const errorData = await dashboardRes.json();
                throw new Error(errorData.error || `HTTP error! status: ${dashboardRes.status}`);
            }
            const data: DashboardData = await dashboardRes.json();
            setDashboardData(data);

             if (studentsRes.error) {
                 // 학생 수 로드 실패는 일단 경고만 하고 계속 진행
                 console.warn('Could not fetch total student count:', studentsRes.error.message);
                 setTotalStudents(0); // 또는 이전 값 유지
             } else {
                 setTotalStudents(studentsRes.count ?? 0);
             }

        } catch (err: any) {
            console.error('Failed to fetch dashboard data:', err);
            setError(err.message || '대시보드 데이터를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // KPI 데이터 계산 (useMemo 사용)
    const kpiData = useMemo(() => {
        if (!dashboardData) return null;

        const { chatbotStats } = dashboardData;
        const totalChatbots = chatbotStats.length;
        const totalSessions = chatbotStats.reduce((sum, stat) => sum + stat.sessionCount, 0);
        const validRates = chatbotStats.map(s => s.averageStudentAchievementRate).filter(rate => typeof rate === 'number');
        const overallAverageRate = validRates.length > 0 ? validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length : 0;

        return {
            totalChatbots,
            totalStudents,
            totalSessions,
            overallAverageRate: parseFloat(overallAverageRate.toFixed(1)), // 소수점 1자리
        };
    }, [dashboardData, totalStudents]);

    // --- 로딩 상태 UI 개선 ---
    if (isLoading) {
        // 스켈레톤 로더 표시
        return (
            <div className="container mx-auto p-6 space-y-6">
                <h1 className="text-3xl font-bold mb-4"><Skeleton className="h-8 w-48" /></h1>
                {/* KPI 스켈레톤 */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-4" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-7 w-16 mt-1" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
                 {/* 차트/테이블 스켈레톤 */}
                 <div className="grid gap-6 md:grid-cols-2">
                     <Card className="md:col-span-2"><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
                     <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
                     <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
                 </div>
            </div>
        );
    }
    // --- 로딩 상태 UI 끝 ---

    if (error) {
        return <div className="p-6 text-red-500">Error loading dashboard: {error}</div>;
    }

    if (!dashboardData || !kpiData || (dashboardData.chatbotStats.length === 0 && dashboardData.goalStats.length === 0)) {
        return <div className="p-6 text-gray-500">No data available for the dashboard yet.</div>;
    }

    const { chatbotStats, goalStats } = dashboardData;
    const participantPieData = chatbotStats.map(stat => ({ name: stat.name, value: stat.participantCount })).filter(d => d.value > 0);

    return (
        <div className="container mx-auto p-6 space-y-6">
            <h1 className="text-3xl font-bold mb-4">Dashboard</h1>

            {/* KPI 카드 그리드 */} 
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Chatbots</CardTitle>
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpiData.totalChatbots}</div>
                        {/* <p className="text-xs text-muted-foreground">+2 from last month</p> */}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpiData.totalStudents}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpiData.totalSessions}</div>
                    </CardContent>
                </Card>
                <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Goal Achievement</CardTitle>
                         <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpiData.overallAverageRate}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* 차트 및 테이블 그리드 */} 
            <div className="grid gap-6 lg:grid-cols-2"> {/* lg 화면에서 2열 */}
                {/* 챗봇 참여자 분포 (파이 차트) - 새로 추가 */}
                <Card>
                    <CardHeader>
                        <CardTitle>Chatbot Participation Distribution</CardTitle>
                        <CardDescription>Distribution of student participation across chatbots.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {participantPieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={participantPieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={renderCustomizedLabel}
                                        outerRadius={100} // 파이 크기 조절
                                        fill="#8884d8"
                                        dataKey="value"
                                        nameKey="name" // Tooltip에 챗봇 이름 표시
                                    >
                                        {participantPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-center text-gray-500 py-4">No participation data available.</p>
                        )}
                    </CardContent>
                </Card>

                {/* 학습 목표 달성률 (막대 차트 - 기존 위치 조정) */}
                <Card>
                    <CardHeader>
                         <CardTitle>Learning Goal Achievement Rate</CardTitle>
                         <CardDescription>Percentage of students achieving each goal.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {goalStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={goalStats} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" domain={[0, 100]} unit="%" />
                                    <YAxis dataKey="goalText" type="category" width={150} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} /> {/* 소수점 표시 */}
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="achievementRate" fill="#82ca9d" name="Achievement Rate" barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                         ) : (
                             <p className="text-center text-gray-500 py-4">No learning goal statistics available.</p>
                         )}
                    </CardContent>
                </Card>
            </div>

            {/* 테이블 영역 (별도 행 또는 그리드 아이템) */}
            <div className="grid gap-6 md:grid-cols-1"> {/* 테이블은 한 행에 하나씩 */}
                 {/* 챗봇 통계 (테이블 - 기존 위치 조정) */}
                 <Card>
                    <CardHeader>
                        <CardTitle>Chatbot Performance Overview</CardTitle>
                        <CardDescription>Summary of participation and average achievement per chatbot.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {/* 테이블 가로 스크롤을 위해 div 추가 */}
                        <div className="overflow-x-auto">
                            {chatbotStats.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Chatbot Name</TableHead>
                                            <TableHead className="text-right">Participants</TableHead>
                                            <TableHead className="text-right">Sessions</TableHead>
                                            <TableHead className="text-right">Avg. Achievement (%)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {chatbotStats.map((stat) => (
                                            <TableRow key={stat.id}>
                                                <TableCell className="font-medium">{stat.name}</TableCell>
                                                <TableCell className="text-right">{stat.participantCount}</TableCell>
                                                <TableCell className="text-right">{stat.sessionCount}</TableCell>
                                                <TableCell className="text-right font-semibold">{stat.averageStudentAchievementRate.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center text-gray-500 py-4">No chatbot statistics available.</p>
                            )}
                        </div>
                    </CardContent>
                 </Card>

                {/* 학습 목표 통계 (테이블 - 수정) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Learning Goal Details</CardTitle>
                        <CardDescription>Detailed statistics for each learning goal.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="overflow-x-auto">
                            {goalStats.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {/* 목표 텍스트 컬럼 너비 확보 및 줄바꿈 허용 */}
                                            <TableHead className="w-[40%] whitespace-normal">Learning Goal</TableHead>
                                            <TableHead className="text-right">Achieved Students</TableHead>
                                            <TableHead className="text-right">Total Students</TableHead>
                                            <TableHead className="text-right">Achievement Rate (%)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {goalStats.map((stat, index) => (
                                            <TableRow key={index}>
                                                 {/* 목표 텍스트 줄바꿈 */}
                                                <TableCell className="font-medium whitespace-normal">{stat.goalText}</TableCell>
                                                <TableCell className="text-right">{stat.achieved}</TableCell>
                                                <TableCell className="text-right">{stat.total}</TableCell>
                                                <TableCell className="text-right font-semibold">{stat.achievementRate.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             ) : (
                                <p className="text-center text-gray-500 py-4">No learning goal statistics available.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 