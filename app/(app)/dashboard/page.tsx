import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WeeklyContent from './weekly-content'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { count: mediaCount } = await supabase.from('media_assets').select('*', { count: 'exact', head: true })
  return <div>
    <div className="page-header"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-stone-400 mb-1">Fireova Content</p><h1 className="text-xl font-semibold text-stone-900">Your content for the week</h1><p className="text-stone-500 text-sm mt-0.5">Approve what feels right. Deny what doesn't.</p></div><Link href="/media-bank" className="btn-secondary">Media Bank · {mediaCount??0}</Link></div></div>
    <div className="page-content"><WeeklyContent/></div>
  </div>
}
