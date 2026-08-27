'use client'

import PhotoPolishButton from './photo-polish-button'
import { createClient } from '@/lib/supabase/client'

type Asset = { id:string; filename:string; storage_path:string; file_type:string; ai_status?:string|null; user_override_status?:string|null }

export default function PhotoPolishTest({ assets }:{ assets:Asset[] }) {
  const photo = assets.find(a => a.file_type?.startsWith('image/') && (a.user_override_status || a.ai_status || '').toLowerCase() === 'strong')
  if (!photo) return null
  const sb = createClient()
  const publicUrl = (path:string) => sb.storage.from('media').getPublicUrl(path).data.publicUrl
  return <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Professional photo finishing</p>
        <p className="mt-1 text-sm text-stone-600">Test the safe polish on one Strong photo before we add it to every photo action.</p>
      </div>
      <div className="w-40">
        <PhotoPolishButton asset={photo} publicUrl={publicUrl} label="Test Polish" onAccepted={()=>window.location.reload()} />
      </div>
    </div>
  </div>
}
