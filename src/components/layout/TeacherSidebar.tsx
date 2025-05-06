'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, MessageSquare, BarChart2, GraduationCap, Settings, LogOut, Bot, School } from 'lucide-react';
import clsx from 'clsx'; // 조건부 클래스 적용 유틸리티
import { SignOutButton } from "@clerk/nextjs";
import { Button } from '@/components/ui/button';

const navigation = [
    { name: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
    { name: 'Chatbots', href: '/teacher/chatbots', icon: Bot },
    { name: 'Classes', href: '/teacher/classes', icon: Users },
    { name: 'Students', href: '/teacher/students', icon: GraduationCap }, // 아이콘 변경 필요 시 수정
    { name: 'Conversations', href: '/teacher/conversations', icon: MessageSquare },
    // TODO: Add other teacher navigation links if needed
];

export default function TeacherSidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex flex-col">
            <div className="mb-6">
                {/* 로고나 앱 이름 자리 (옵션) */}
                <Link href="/teacher/dashboard" className="text-2xl font-bold text-blue-600">
                    ChatCat
                </Link>
                <p className="text-xs text-gray-500">Teacher Dashboard</p>
            </div>
            <nav className="flex-1 space-y-1">
                {navigation.map((item) => (
                    <Link
                        key={item.name}
                        href={item.href}
                        className={clsx(
                            'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                            pathname.startsWith(item.href) // 현재 경로 또는 하위 경로 활성화
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                        )}
                    >
                        <item.icon
                            className={clsx(
                                'mr-3 h-5 w-5 flex-shrink-0',
                                pathname.startsWith(item.href) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                            )}
                            aria-hidden="true"
                        />
                        {item.name}
                    </Link>
                ))}
            </nav>
            <div className="mt-auto">
                {/* 로그아웃 버튼 또는 사용자 정보 표시 영역 (추후 구현) */}
                {/* <button className="...">Logout</button> */}
            </div>
        </aside>
    );
} 