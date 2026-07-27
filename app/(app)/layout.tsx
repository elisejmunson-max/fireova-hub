import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/sidebar'
import EventsSyncProvider from '@/components/events-sync-provider'

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
      <EventsSyncProvider />
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col overflow-hidden pt-[calc(env(safe-area-inset-top)+3rem)] lg:pt-0">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
