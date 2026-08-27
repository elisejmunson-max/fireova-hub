import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar user={user} />
      <div className="min-h-screen md:ml-64 lg:pt-0 pt-14">
        <main className="min-h-screen overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
