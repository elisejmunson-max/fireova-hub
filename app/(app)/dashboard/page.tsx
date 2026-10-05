import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import WeeklyContent from './weekly-content-persistent';
import { chicagoPlanningAnchor } from '@/lib/manual-content-drafts';

export const metadata: Metadata = { title: 'Create Content' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const sb = createClient() as any;
  const { data: { user } } = await sb.auth.getUser();
  let media: any[] = [], approvedCount = 0, savedSlots: any[] = [], planCoverage: any[] = [], queueUpdatedAt: string|null = null, loadError = '';
  const preMigrationMode = process.env.CONTENT_PLANNING_PRE_MIGRATION === 'true';
  let planningAvailable = true;
  if (user && user.id !== 'dev') {
    const [{ data: newest, error: mediaError }, { data: approved, error: approvedError }, { data: queue, error: queueError }, { data: planned, error: planError }] = await Promise.all([
      sb.from('media_assets').select('id,filename,storage_path,file_type,tags,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(250),
      sb.from('posts').select('id,created_at,plan_slot_id,planning_date,plan_position').eq('user_id', user.id).eq('pillar', 'Approved Posts').order('created_at', { ascending: false }).limit(250),
      sb.from('review_queue').select('slots,updated_at').eq('user_id', user.id).maybeSingle(),
      sb.from('content_plan_slots').select('slot_id,position,planning_date,state,approved_post_id').eq('user_id', user.id).in('state', ['approved','skipped','removed']).order('position', { ascending: false }).limit(500),
    ]);
    let approvedRows = approved, approvedLoadError = approvedError;
    if (approvedError) {
      const legacy = await sb.from('posts').select('id,created_at').eq('user_id', user.id).eq('pillar', 'Approved Posts').order('created_at', { ascending: false }).limit(250);
      if (!legacy.error) { approvedRows = legacy.data; approvedLoadError = null; }
    }
    media = newest || [];
    loadError = [mediaError&&'Media Bank',approvedLoadError&&'approved posts',queueError&&'review queue'].filter(Boolean).length
      ? `Could not load ${[mediaError&&'Media Bank',approvedLoadError&&'approved posts',queueError&&'review queue'].filter(Boolean).join(', ')}. Retry before making a decision.`
      : '';
    approvedCount = approvedRows?.length || 0;
    savedSlots = Array.isArray(queue?.slots) ? queue.slots : [];
    const durableCoverage = planError ? [] : (planned || []).map((slot: any) => ({ slotId: slot.slot_id, position: slot.position, planningDate: slot.planning_date, state: slot.state, approvedPostId: slot.approved_post_id }));
    planningAvailable = !planError || preMigrationMode;
    if (planError && !preMigrationMode) loadError = `${loadError ? `${loadError} ` : ''}Content planning is unavailable. Review and planning changes are temporarily disabled.`;
    const coverageBySlot = new Map(durableCoverage.map((slot: any) => [slot.slotId, slot]));
    for (const post of approvedRows || []) if (post.plan_slot_id && Number.isInteger(post.plan_position) && !coverageBySlot.has(post.plan_slot_id)) coverageBySlot.set(post.plan_slot_id, { slotId: post.plan_slot_id, position: post.plan_position, planningDate: post.planning_date || '', state: 'approved', approvedPostId: post.id });
    planCoverage = [...coverageBySlot.values()];
    queueUpdatedAt = queue?.updated_at || null;
    const loadedIds = new Set(media.map((asset: any) => asset.id));
    const referencedIds = savedSlots.flatMap((slot: any) => Array.isArray(slot?.assetIds) ? slot.assetIds : []);
    const missingIds = [...new Set<string>(referencedIds)].filter(id => typeof id === 'string' && !loadedIds.has(id));
    if (missingIds.length) {
      const { data: savedMedia } = await sb.from('media_assets').select('id,filename,storage_path,file_type,tags,created_at').eq('user_id', user.id).in('id', missingIds);
      media = [...media, ...(savedMedia || [])];
    }
    if (approvedRows?.length) {
      const postIds = approvedRows.map((post: any) => post.id);
      const { data: links } = await sb.from('post_media').select('post_id,asset_id').in('post_id', postIds);
      const postTime = new Map<string, number>(approvedRows.map((post: any) => [post.id, new Date(post.created_at).getTime()]));
      const lastUsed = new Map<string, number>();
      for (const link of links || []) { const usedAt = postTime.get(link.post_id) || 0; if (usedAt > (lastUsed.get(link.asset_id) || 0)) lastUsed.set(link.asset_id, usedAt); }
      media = [...media].sort((a: any, b: any) => { const au = lastUsed.get(a.id), bu = lastUsed.get(b.id); if (au == null && bu != null) return -1; if (au != null && bu == null) return 1; if (au != null && bu != null && au !== bu) return au - bu; return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
    }
  }
  const planningAnchor = chicagoPlanningAnchor(new Date());
  return <div><div className="page-content editorial-create-page py-4 sm:py-8"><div><WeeklyContent initialAssets={media} savedSlots={savedSlots} initialPlanCoverage={planCoverage} planningAnchor={planningAnchor} planningAvailable={planningAvailable} initialQueueUpdatedAt={queueUpdatedAt} approvedCount={approvedCount} loadError={loadError}/></div></div></div>;
}
