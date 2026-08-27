import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headerStore = headers()
  const host = headerStore.get('host') ?? ''
  const isVercelPreview = host.endsWith('.vercel.app') && host !== 'fireova-hub-bamo.vercel.app'

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Production remains protected. Preview deployments may be opened directly
  // for owner visual review without fighting production magic-link redirects.
  if (!user && !isVercelPreview) {
    redirect('/login')
  }

  const previewUser = user ?? {
    id: 'preview-reviewer',
    email: 'Preview Mode',
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <Sidebar user={previewUser as any} />
      <div className="flex-1 flex flex-col overflow-hidden lg:pt-0 pt-14">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
