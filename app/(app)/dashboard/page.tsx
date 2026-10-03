import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import WeeklyContent from './weekly-content-persistent';

export const metadata: Metadata = { title: 'Create Content' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const sb = createClient() as any;
  const { data: { user } } = await sb.auth.getUser();
  let media: any[] = [], approvedCount = 0, savedSlots: any[] = [];
  if (user && user.id !== 'dev') {
    const [{ data: newest }, { data: approved }, { data: queue }] = await Promise.all([
      sb.from('media_assets').select('id,filename,storage_path,file_type,ai_categories,ai_reason,tags,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(250),
      sb.from('posts').select('id,created_at').eq('user_id', user.id).eq('pillar', 'Approved Posts').order('created_at', { ascending: false }).limit(250),
      sb.from('review_queue').select('slots').eq('user_id', user.id).maybeSingle(),
    ]);
    media = newest || [];
    approvedCount = approved?.length || 0;
    savedSlots = Array.isArray(queue?.slots) ? queue.slots : [];
    const loadedIds = new Set(media.map((asset: any) => asset.id));
    const referencedIds = savedSlots.flatMap((slot: any) => Array.isArray(slot?.assetIds) ? slot.assetIds : []);
    const missingIds = [...new Set<string>(referencedIds)].filter(id => typeof id === 'string' && !loadedIds.has(id));
    if (missingIds.length) {
      const { data: savedMedia } = await sb.from('media_assets').select('id,filename,storage_path,file_type,ai_categories,ai_reason,tags,created_at').eq('user_id', user.id).in('id', missingIds);
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
  return <div><div className="page-header py-3"><div className="flex items-center justify-end gap-2"><Link href="/approved-posts" className="btn-secondary">Approved Posts · {approvedCount}</Link><Link href="/media-bank" className="btn-secondary">Media Bank · {media.length}</Link></div></div><div className="page-content py-3"><div className="mx-auto max-w-[1120px]"><WeeklyContent initialAssets={media} savedSlots={savedSlots}/></div></div></div>;
}
