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

    const { error } = await sb.from('review_queue').upsert(
      { user_id: user.id, slots, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) return Response.json({ error: error.message || 'Could not save review queue' }, { status: 500 });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save review queue' }, { status: 500 });
  }
}
