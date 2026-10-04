import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import WeeklyContent from './weekly-content-persistent';

export const metadata: Metadata = { title: 'Create Content' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const sb = createClient() as any;
  const { data: { user } } = await sb.auth.getUser();
  let media: any[] = [], approvedCount = 0, savedSlots: any[] = [], queueUpdatedAt: string|null = null, loadError = '';
  if (user && user.id !== 'dev') {
    const [{ data: newest, error: mediaError }, { data: approved, error: approvedError }, { data: queue, error: queueError }] = await Promise.all([
      sb.from('media_assets').select('id,filename,storage_path,file_type,tags,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(250),
      sb.from('posts').select('id,created_at').eq('user_id', user.id).eq('pillar', 'Approved Posts').order('created_at', { ascending: false }).limit(250),
      sb.from('review_queue').select('slots,updated_at').eq('user_id', user.id).maybeSingle(),
    ]);
    media = newest || [];
    loadError = [mediaError&&'Media Bank',approvedError&&'approved posts',queueError&&'review queue'].filter(Boolean).length
      ? `Could not load ${[mediaError&&'Media Bank',approvedError&&'approved posts',queueError&&'review queue'].filter(Boolean).join(', ')}. Retry before making a decision.`
      : '';
    approvedCount = approved?.length || 0;
    savedSlots = Array.isArray(queue?.slots) ? queue.slots : [];
    queueUpdatedAt = queue?.updated_at || null;
    const loadedIds = new Set(media.map((asset: any) => asset.id));
    const referencedIds = savedSlots.flatMap((slot: any) => Array.isArray(slot?.assetIds) ? slot.assetIds : []);
    const missingIds = [...new Set<string>(referencedIds)].filter(id => typeof id === 'string' && !loadedIds.has(id));
    if (missingIds.length) {
      const { data: savedMedia } = await sb.from('media_assets').select('id,filename,storage_path,file_type,tags,created_at').eq('user_id', user.id).in('id', missingIds);
      media = [...media, ...(savedMedia || [])];
    }
    if (approved?.length) {
      const postIds = approved.map((post: any) => post.id);
      const { data: links } = await sb.from('post_media').select('post_id,asset_id').in('post_id', postIds);
      const postTime = new Map<string, number>(approved.map((post: any) => [post.id, new Date(post.created_at).getTime()]));
      const lastUsed = new Map<string, number>();
      for (const link of links || []) { const usedAt = postTime.get(link.post_id) || 0; if (usedAt > (lastUsed.get(link.asset_id) || 0)) lastUsed.set(link.asset_id, usedAt); }
      media = [...media].sort((a: any, b: any) => { const au = lastUsed.get(a.id), bu = lastUsed.get(b.id); if (au == null && bu != null) return -1; if (au != null && bu == null) return 1; if (au != null && bu != null && au !== bu) return au - bu; return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
    }
  }
  return <div><div className="page-content py-4 sm:py-8"><div className="mx-auto max-w-[1116px]"><WeeklyContent initialAssets={media} savedSlots={savedSlots} initialQueueUpdatedAt={queueUpdatedAt} approvedCount={approvedCount} loadError={loadError}/></div></div></div>;
}
