import { createClient } from '@/lib/supabase/server';
import { saveMediaBankPoster } from '@/lib/media-bank-poster-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  return saveMediaBankPoster(request, params.id, {
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user;
    },
    getOwnedAsset: async (id, owner) => {
      const { data, error } = await supabase.from('media_assets').select('id,user_id,file_type').eq('id', id).eq('user_id', owner).maybeSingle();
      if (error) throw new Error('Poster lookup failed');
      return data;
    },
    remove: async path => {
      const { error } = await supabase.storage.from('media').remove([path]);
      if (error) throw new Error('Poster cleanup failed');
    },
    upload: async (path, bytes) => {
      const { error } = await supabase.storage.from('media').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      return !error;
    },
  });
}
