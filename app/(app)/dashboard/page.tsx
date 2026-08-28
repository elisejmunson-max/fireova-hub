import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WeeklyContent from './weekly-content'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  let reviewed:any[]=[]
  let mediaCount=0
  if(user&&user.id!=='dev'){
    const {data}=await supabase.from('media_assets').select('id,filename,storage_path,file_type,ai_status,user_override_status,ai_categories,ai_post_uses,ai_reason,tags,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(250)
    reviewed=data||[]
    const countResult=await supabase.from('media_assets').select('*',{count:'exact',head:true}).eq('user_id',user.id)
    mediaCount=countResult.count??reviewed.length
  }
  return <div>
    <div className="page-header"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-stone-400 mb-1">Fireova Content</p><h1 className="text-xl font-semibold text-stone-900">Your content for the week</h1><p className="text-stone-500 text-sm mt-0.5">Approve what feels right. Deny what doesn't.</p></div><Link href="/media-bank" className="btn-secondary">Media Bank · {mediaCount}</Link></div></div>
    <div className="page-content"><WeeklyContent initialAssets={reviewed}/></div>
  </div>
}
