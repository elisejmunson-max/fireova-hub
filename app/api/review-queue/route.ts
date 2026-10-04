import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const sb = createClient() as any;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const slots = Array.isArray(body?.slots) ? body.slots : null;
    if (!slots) return Response.json({ error: 'Invalid review queue' }, { status: 400 });

    const updatedAt = new Date().toISOString();
    const guardsStaleSave = Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt');
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
