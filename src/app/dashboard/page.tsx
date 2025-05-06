import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data, error } = await supabase.auth.getUser()

  // If user is not logged in or there's an error, redirect to login
  if (error || !data?.user) {
    redirect('/auth/login?message=Please login to access the dashboard.')
  }

  // Logout Server Action
  const signOut = async () => {
    'use server'
    const supabase = createClient(cookieStore)
    await supabase.auth.signOut()
    redirect('/auth/login?message=You have been logged out.')
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-24">
      <h1 className="mb-6 text-3xl font-bold">Teacher Dashboard</h1>
      <p className="mb-4">Welcome, {data.user.email}!</p>
      <p className="mb-8">This is your protected dashboard page.</p>
      
      <form action={signOut}>
        <button 
          type="submit" 
          className="rounded-md bg-red-500 px-4 py-2 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Logout
        </button>
      </form>
    </div>
  )
}
