import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MediaBankClient from './client'
import MediaIntelligencePanel from './intelligence-panel'
import type { MediaAsset } from '@/lib/types'

export const metadata: Metadata = { title: 'Media Bank' }

export default async function MediaBankPage({ searchParams }: { searchParams?: { eventId?: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let assets: MediaAsset[] = []
  const eventId = searchParams?.eventId?.trim()

  if (user && user.id !== 'dev') {
    if (eventId) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      // Event media is mirrored into media_assets by the event workflow. Filter
      // by the stable event tag so this screen is the exact same reviewer, just
      // scoped to one event.
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .contains('tags', [`event:${eventId}`])
        .order('created_at', { ascending: true })
        .limit(500)
      if (!error && data) assets = data as MediaAsset[]
      void baseUrl
    } else {
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (!error && data) assets = data as MediaAsset[]
    }
  }

  return (
    <div>
      {eventId && assets.length === 0 && (
        <div className="card mb-6 p-6 text-center">
          <p className="text-sm font-semibold text-stone-900">Preparing this event for AI review…</p>
          <p className="mt-1 text-sm text-stone-500">Return to the event and choose Review Media once the event media is synced.</p>
        </div>
      )}
      {assets.length > 0 && <MediaIntelligencePanel assets={assets as any[]} />}
      {!eventId && <MediaBankClient initialAssets={assets} userId={user?.id ?? 'dev'} />}
    </div>
  )
}
