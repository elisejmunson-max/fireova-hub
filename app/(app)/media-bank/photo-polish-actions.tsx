'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PhotoPolishButton from './photo-polish-button'

type Asset = { id:string; filename:string; storage_path:string; file_type:string; ai_status?:string|null; user_override_status?:string|null }

export default function PhotoPolishActions({ assets }:{ assets:Asset[] }) {
  const [selectedId,setSelectedId]=useState(assets[0]?.id??'')
  const [accepted,setAccepted]=useState<any|null>(null)
  const sb=createClient()
  const url=(p:string)=>sb.storage.from('media').getPublicUrl(p).data.publicUrl
  const selected=useMemo(()=>assets.find(a=>a.id===selectedId)??assets[0],[assets,selectedId])
  const status=String(selected?.user_override_status||selected?.ai_status||'').toLowerCase()
  const photo=selected&&selected.file_type?.startsWith('image/')&&(status==='strong'||status==='edit')

  useEffect(()=>{
    const handler=(event:MouseEvent)=>{
      const button=(event.target as HTMLElement)?.closest('button')
      if(!button)return
      const name=button.querySelector('p.font-semibold')?.textContent?.trim()
      if(!name)return
      const match=assets.find(a=>a.filename===name)
      if(match)setSelectedId(match.id)
    }
    document.addEventListener('click',handler,true)
    return()=>document.removeEventListener('click',handler,true)
  },[assets])

  if(!photo)return null
  return <div className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-40px))] rounded-xl border bg-white p-3 shadow-xl">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Selected photo</p>
    <p className="mb-2 truncate text-sm font-semibold">{selected.filename}</p>
    {accepted?<div><p className="text-sm text-emerald-700">Polished copy created.</p><button className="btn-secondary mt-2 w-full justify-center" onClick={()=>location.reload()}>Refresh reviewer</button></div>:<PhotoPolishButton asset={selected} publicUrl={url} label={status==='edit'?'Fix Photo':'Polish Photo'} onAccepted={setAccepted}/>} 
  </div>
}
