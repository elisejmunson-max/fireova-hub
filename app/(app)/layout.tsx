import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppChrome from '@/components/layout/app-chrome'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <AppChrome user={user}>{children}</AppChrome>
}
