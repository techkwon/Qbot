import React from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TeacherSidebar from '@/components/layout/TeacherSidebar';
import { verifyTeacherRole } from '@/lib/authUtils';

export default async function TeacherLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        console.log('User not authenticated, redirecting to login.');
        redirect('/auth/login');
    }

    const isTeacher = await verifyTeacherRole(supabase, user);
    if (!isTeacher) {
         console.log(`User ${user.id} is not a teacher, redirecting to student login or showing error.`);
        return (
            <html lang="en">
                <body>
                    <div className="flex items-center justify-center min-h-screen bg-gray-100">
                        <div className="p-8 bg-white rounded shadow-md text-center">
                             <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
                            <p>You must be logged in as a teacher to access this area.</p>
                        </div>
                    </div>
                </body>
            </html>
        );
    }

    return (
         <div className="flex h-screen bg-gray-100">
            <TeacherSidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                {children}
            </main>
        </div>
    );
} 