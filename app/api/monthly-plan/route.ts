import { createClient } from '@/lib/supabase/server';
import { MAX_MONTHLY_ENTRIES, validMonth, shiftMonth, validFeatureWrite, shortPostTitle, type MonthlyEntry } from '@/lib/monthly-planning';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const unavailable = () => json({ error: 'Monthly plan is unavailable. Try again.' }, 503);

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get('month');
  if (!validMonth(month)) return json({ error: 'Choose a valid month.' }, 400);
  const sb = createClient() as any;
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user || user.id === 'dev') return json({ error: 'Sign in to view your monthly plan.' }, 401);
  try {
    const [features, planned, queue] = await Promise.all([
      sb.from('monthly_feature_plans').select('revision,priorities').eq('user_id', user.id).eq('month', `${month}-01`).maybeSingle(),
      sb.from('content_plan_slots').select('slot_id,planning_date,state,draft_id,approved_post_id').eq('user_id', user.id).gte('planning_date', `${month}-01`).lt('planning_date', `${shiftMonth(month, 1)}-01`).in('state', ['draft','approved']).order('planning_date').order('slot_id').limit(MAX_MONTHLY_ENTRIES + 1),
      sb.from('review_queue').select('slots').eq('user_id', user.id).maybeSingle(),
    ]);
    if (features.error || planned.error || queue.error) return unavailable();
    const slots = (planned.data || []).slice(0, MAX_MONTHLY_ENTRIES);
    const postIds = slots.map((slot: any) => slot.approved_post_id).filter(Boolean);
    const approved = postIds.length ? await sb.from('posts').select('id,title,status').eq('user_id', user.id).in('id', postIds).limit(MAX_MONTHLY_ENTRIES) : { data: [], error: null };
    if (approved.error) return unavailable();
    const draftById = new Map((Array.isArray(queue.data?.slots) ? queue.data.slots : []).map((slot: any) => [slot.draftId, slot]));
    const postById = new Map((approved.data || []).map((post: any) => [post.id, post]));
    const entries: MonthlyEntry[] = slots.map((slot: any) => {
      const draft: any = draftById.get(slot.draft_id), post: any = postById.get(slot.approved_post_id);
      const status = slot.state === 'approved' ? post?.status === 'scheduled' ? 'Scheduled' : post?.status === 'published' ? 'Published' : 'Approved' : draft?.revision?.status === 'waiting' ? 'Waiting' : draft?.revision?.status === 'revised' ? 'Revised' : 'Draft';
      return { id: slot.slot_id, date: slot.planning_date, title: slot.state === 'approved' ? shortPostTitle(post?.title, '') : shortPostTitle(draft?.purpose, draft?.caption), status, ...(draft ? { draftId: slot.draft_id } : {}), ...(post ? { postId: post.id } : {}) };
    });
    return json({ month, features: { month, revision: features.data?.revision || 0, priorities: features.data?.priorities || [] }, entries, truncated: (planned.data || []).length > MAX_MONTHLY_ENTRIES });
  } catch { return unavailable(); }
}

// Bound the streamed body as well as Content-Length, including chunked requests.
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('format');
  if (Number(request.headers.get('content-length') || 0) > 65536) throw new Error('size');
  const reader = request.body?.getReader(); if (!reader) throw new Error('format');
  let size = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { await reader.cancel(); throw new Error('size'); } text += decoder.decode(value, { stream: true }); }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function PUT(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403);
  const sb = createClient() as any;
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user || user.id === 'dev') return json({ error: 'Sign in to save your priorities.' }, 401);
  let body: unknown;
  try { body = await readBody(request); } catch (error) { return json({ error: error instanceof Error && error.message === 'size' ? 'Request is too large.' : 'Invalid priorities.' }, error instanceof Error && error.message === 'size' ? 413 : 400); }
  if (!validFeatureWrite(body)) return json({ error: 'Use up to 20 priorities, with 1,000 characters each.' }, 400);
  const { month, priorities, revision } = body;
  try {
    const record = { user_id: user.id, month: `${month}-01`, priorities, revision: revision + 1 };
    const result = revision === 0
      ? await sb.from('monthly_feature_plans').insert(record).select('revision,priorities').single()
      : await sb.from('monthly_feature_plans').update({ priorities, revision: revision + 1 }).eq('user_id', user.id).eq('month', `${month}-01`).eq('revision', revision).select('revision,priorities').maybeSingle();
    if (result.error?.code === '23505' || (!result.error && !result.data)) return json({ error: 'Changed in another window. Your edits are kept.' }, 409);
    if (result.error) return unavailable();
    return json({ month, revision: result.data.revision, priorities: result.data.priorities });
  } catch { return unavailable(); }
}
