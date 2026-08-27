import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MediaBankClient from './client'
import MediaIntelligencePreview from './intelligence-preview'

export const metadata: Metadata = { title: 'Media Bank' }

export default async function MediaBankPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div>
      <MediaIntelligencePreview />
      <MediaBankClient initialAssets={[]} userId={user?.id ?? 'dev'} />
    </div>
  )
}
