import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MediaBankClient from './client'
import type { MediaAsset } from '@/lib/types'

export const metadata: Metadata = { title: 'Media Bank' }

export default async function MediaBankPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('media_assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const assets: MediaAsset[] = data ?? []

  return <MediaBankClient initialAssets={assets} userId={user?.id ?? 'dev'} />
}
