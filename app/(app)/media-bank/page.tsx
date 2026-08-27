import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MediaBankClient from './client'
import MediaIntelligencePreview from './intelligence-preview'
import type { MediaAsset } from '@/lib/types'

export const metadata: Metadata = { title: 'Media Bank' }

export default async function MediaBankPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let assets: MediaAsset[] = []

  if (user && user.id !== 'dev') {
    const { data, error } = await supabase
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (!error && data) assets = data as MediaAsset[]
  }

  return (
    <div>
      <MediaIntelligencePreview />
      <MediaBankClient initialAssets={assets} userId={user?.id ?? 'dev'} />
    </div>
  )
}
