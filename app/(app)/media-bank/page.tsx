import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import MediaBankClient from './client'
import MediaIntelligencePanel from './intelligence-panel'
import type { MediaAsset } from '@/lib/types'

export const metadata: Metadata = { title: 'Media Bank' }

export default async function MediaBankPage({ searchParams }: { searchParams?: { eventId?: string } }) {
  const supabase = createClient() as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let assets: MediaAsset[] = []
  const eventId = searchParams?.eventId?.trim()

  if (user && user.id !== 'dev') {
    if (eventId) {
      // Reuse the event's existing Storage objects. Nothing is uploaded twice.
      // Mirroring the database row with the same UUID lets the exact Media Bank
      // Strong / Worth Editing / Skip reviewer work unchanged for this event.
      const { data: eventMedia } = await supabase
        .from('event_media')
        .select('id,storage_path,file_name,file_type,size_bytes,created_at')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })

      if (eventMedia?.length) {
        await supabase.from('media_assets').upsert(eventMedia.map((item: any) => ({
          id: item.id,
          user_id: user.id,
          filename: item.file_name,
          storage_path: item.storage_path,
          file_type: item.file_type,
          size_bytes: item.size_bytes ?? 0,
          tags: [`event:${eventId}`],
          notes: null,
          created_at: item.created_at,
        })), { onConflict: 'id', ignoreDuplicates: true })
      }

      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .contains('tags', [`event:${eventId}`])
        .order('created_at', { ascending: true })
        .limit(500)
      if (!error && data) assets = data as MediaAsset[]
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
          <p className="text-sm font-semibold text-stone-900">No event media found for review.</p>
          <p className="mt-1 text-sm text-stone-500">Go back to the event and confirm its media finished uploading.</p>
        </div>
      )}
      {assets.length > 0 && <MediaIntelligencePanel assets={assets as any[]} />}
      {!eventId && <MediaBankClient initialAssets={assets} userId={user?.id ?? 'dev'} />}
    </div>
  )
}
