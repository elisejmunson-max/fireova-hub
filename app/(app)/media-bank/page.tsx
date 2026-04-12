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

  return <MediaBankClient initialAssets={[]} userId={user?.id ?? 'dev'} />
}
