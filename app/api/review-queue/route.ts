import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const sb = createClient() as any;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const slots = Array.isArray(body?.slots) ? body.slots : null;
    const validIdentity=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=512&&/^[A-Za-z0-9._:-]+$/.test(value);
    const positions=new Set<number>(),draftIds=new Set<string>(),slotIds=new Set<string>();
    const valid=slots&&slots.length<=100&&slots.every((slot:any)=>{const assets=Array.isArray(slot?.assetIds)?slot.assetIds:[],position=slot?.planPosition,ok=validIdentity(slot?.draftId)&&validIdentity(slot?.planSlotId)&&Number.isInteger(position)&&position>=0&&position<1000000&&/^\d{4}-\d{2}-\d{2}$/.test(String(slot?.planningDate||''))&&['Photo','Carousel','Reel'].includes(slot?.kind)&&typeof slot?.caption==='string'&&Boolean(slot.caption.trim())&&assets.length>0&&assets.length<=10&&new Set(assets.map(String)).size===assets.length&&!positions.has(position)&&!draftIds.has(slot.draftId)&&!slotIds.has(slot.planSlotId);if(ok){positions.add(position);draftIds.add(slot.draftId);slotIds.add(slot.planSlotId)}return ok});
    if (!valid || !Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt')) return Response.json({ error: 'Invalid review queue' }, { status: 400 });

    const updatedAt = new Date().toISOString();
    const guardsStaleSave = Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt');
    const rpc = await sb.rpc('save_review_queue_with_plan', {
      p_slots: slots,
      p_expected_updated_at: body.expectedUpdatedAt ? String(body.expectedUpdatedAt) : null,
    });
    if (!rpc.error) {
      if (rpc.data?.conflict) return Response.json({ error: 'This review queue changed in another window. Refresh before saving.' }, { status: 409 });
      return Response.json({ ok: true, updatedAt: rpc.data?.updatedAt || updatedAt });
    }
    const missingPlanningMigration = rpc.error?.code === 'PGRST202';
    if (!missingPlanningMigration || process.env.CONTENT_PLANNING_PRE_MIGRATION !== 'true') return Response.json({ error: missingPlanningMigration ? 'Content planning is unavailable until its migration is installed.' : rpc.error?.message || 'Could not save review queue' }, { status: missingPlanningMigration ? 503 : 500 });
    let error: any = null;
    if (guardsStaleSave && body.expectedUpdatedAt) {
      const result = await sb.from('review_queue').update({ slots, updated_at: updatedAt }).eq('user_id', user.id).eq('updated_at', String(body.expectedUpdatedAt)).select('updated_at').maybeSingle();
      error = result.error;
      if (!error && !result.data) return Response.json({ error: 'This review queue changed in another window. Refresh before saving.' }, { status: 409 });
    } else if (guardsStaleSave) {
      const result = await sb.from('review_queue').insert({ user_id: user.id, slots, updated_at: updatedAt });
      error = result.error;
      if (error?.code === '23505') return Response.json({ error: 'This review queue changed in another window. Refresh before saving.' }, { status: 409 });
    } else {
      const result = await sb.from('review_queue').upsert({ user_id: user.id, slots, updated_at: updatedAt }, { onConflict: 'user_id' });
      error = result.error;
    }
    if (error) return Response.json({ error: error.message || 'Could not save review queue' }, { status: 500 });

    return Response.json({ ok: true, updatedAt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save review queue' }, { status: 500 });
  }
}
