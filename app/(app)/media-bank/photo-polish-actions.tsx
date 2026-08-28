'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Asset={id:string;filename:string;storage_path:string;file_type:string;ai_status?:string|null;user_override_status?:string|null;ai_reason?:string|null;ai_edit_suggestion?:string|null}

export default function PhotoPolishActions({assets}:{assets:Asset[]}){
  const[selectedId,setSelectedId]=useState(assets[0]?.id??'')
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState<string|null>(null)
  const inputRef=useRef<HTMLInputElement|null>(null)
  const sb=createClient()
  const selected=useMemo(()=>assets.find(a=>a.id===selectedId)??assets[0],[assets,selectedId])
  const status=String(selected?.user_override_status||selected?.ai_status||'').toLowerCase()
  const photo=selected&&selected.file_type?.startsWith('image/')&&(status==='strong'||status==='edit')
  const recommendation=selected?.ai_edit_suggestion||selected?.ai_reason||'Use Lightroom only if you want a stronger professional finish. Preserve the real scene and keep colors natural.'

  useEffect(()=>{
    const handler=(event:MouseEvent)=>{
      const button=(event.target as HTMLElement)?.closest('button')
      if(!button)return
      const name=button.querySelector('p.font-semibold')?.textContent?.trim()
      if(!name)return
      const match=assets.find(a=>a.filename===name)
      if(match){setSelectedId(match.id);setMessage(null)}
    }
    document.addEventListener('click',handler,true)
    return()=>document.removeEventListener('click',handler,true)
  },[assets])

  async function downloadOriginal(){
    if(!selected)return
    setBusy(true);setMessage(null)
    try{
      const publicUrl=sb.storage.from('media').getPublicUrl(selected.storage_path).data.publicUrl
      const response=await fetch(publicUrl)
      if(!response.ok)throw new Error('Could not download the original photo.')
      const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a')
      a.href=href;a.download=selected.filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(href)
    }catch(e){setMessage(e instanceof Error?e.message:'Could not download the photo.')}finally{setBusy(false)}
  }

  async function uploadEdited(file:File){
    if(!selected)return
    setBusy(true);setMessage('Uploading Lightroom edit…')
    try{
      const form=new FormData();form.append('file',file)
      const response=await fetch(`/api/media-assets/${encodeURIComponent(selected.id)}/lightroom-replace`,{method:'POST',body:form})
      const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
      if(!response.ok)throw new Error(data.error||`Upload failed (${response.status})`)
      setMessage('Edited photo uploaded. Re-reviewing with AI…')
      const review=await fetch('/api/analyze-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:data.edited.id})})
      if(!review.ok)throw new Error('Edited photo saved, but AI re-review failed.')
      setMessage('Done. Lightroom edit is saved and AI reviewed. Refreshing…')
      setTimeout(()=>location.reload(),700)
    }catch(e){setMessage(e instanceof Error?e.message:'Could not upload the edited photo.')}finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}
  }

  if(!photo)return null
  return <div className="fixed bottom-5 right-5 z-40 w-[min(390px,calc(100vw-40px))] rounded-xl border bg-white p-4 shadow-xl">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Lightroom round trip</p>
    <p className="mt-1 truncate text-sm font-semibold">{selected.filename}</p>
    <div className="mt-3 rounded-lg bg-stone-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Lightroom suggestion</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">{recommendation}</p>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button onClick={downloadOriginal} disabled={busy} className="btn-secondary justify-center disabled:opacity-50">Download Original</button>
      <button onClick={()=>inputRef.current?.click()} disabled={busy} className="btn-primary justify-center disabled:opacity-50">Replace With Edited</button>
    </div>
    <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadEdited(file)}}/>
    {message&&<p className="mt-3 text-xs text-stone-600">{message}</p>}
    <p className="mt-3 text-[11px] leading-4 text-stone-400">Your original stays saved as a backup. The Lightroom version stays connected to this event and is automatically sent back through AI review.</p>
  </div>
}
