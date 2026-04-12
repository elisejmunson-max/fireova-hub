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
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col overflow-hidden lg:pt-0 pt-14">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
