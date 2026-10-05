import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serveThumbnail } from '@/lib/media-bank-thumbnail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // Fail closed instead of using the development mock's synthetic user.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new Response('Thumbnail unavailable', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const supabase = createClient();
  return serveThumbnail(request, params.id, {
    supabaseUrl,
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error || data.user?.id === 'dev' ? null : data.user;
    },
    getOwnedAsset: async (id, owner, signal) => {
      const { data, error } = await supabase.from('media_assets')
        .select('id,user_id,storage_path,file_type,size_bytes,created_at')
        .eq('id', id)
        .eq('user_id', owner)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error('Thumbnail lookup failed');
      return data;
    },
    // Existing media bucket originals are public. This never invokes a paid transform,
    // copies auth headers to storage, or accepts a source URL from the request.
    getSourceUrl: path => supabase.storage.from('media').getPublicUrl(path).data.publicUrl,
  });
}
