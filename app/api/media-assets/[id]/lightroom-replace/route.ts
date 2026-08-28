import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeName(name:string){return name.replace(/[^a-zA-Z0-9._-]+/g,'-')}

export async function POST(request:Request,{params}:{params:{id:string}}){
  const supabase=createClient() as any
  const{data:{user}}=await supabase.auth.getUser()
  if(!user||user.id==='dev')return NextResponse.json({error:'Unauthorized'},{status:401})

  const{data:original,error:originalError}=await supabase.from('media_assets').select('*').eq('id',params.id).eq('user_id',user.id).single()
  if(originalError||!original)return NextResponse.json({error:originalError?.message||'Original media not found'},{status:404})
  if(!String(original.file_type||'').startsWith('image/'))return NextResponse.json({error:'Only photos can be replaced with a Lightroom edit.'},{status:400})

  const form=await request.formData()
  const file=form.get('file')
  if(!(file instanceof File))return NextResponse.json({error:'Choose the edited photo to upload.'},{status:400})
  if(!String(file.type||'').startsWith('image/'))return NextResponse.json({error:'The replacement must be an image file.'},{status:400})

  const newId=crypto.randomUUID()
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase()
  const base=original.filename.replace(/\.[^.]+$/,'')
  const newName=safeName(`${base}-lightroom.${ext}`)
  const folder=original.storage_path.includes('/')?original.storage_path.slice(0,original.storage_path.lastIndexOf('/')):`${user.id}/edited`
  const newPath=`${folder}/${newId}-${newName}`
  const bytes=Buffer.from(await file.arrayBuffer())

  const{error:storageError}=await supabase.storage.from('media').upload(newPath,bytes,{contentType:file.type||'image/jpeg',upsert:false,cacheControl:'3600'})
  if(storageError)return NextResponse.json({error:storageError.message},{status:500})

  const tags=Array.from(new Set([...(original.tags||[]),`edited-from:${original.id}`,'lightroom-edit','ready-for-rereview']))
  const row={
    id:newId,user_id:user.id,filename:newName,storage_path:newPath,file_type:file.type||'image/jpeg',size_bytes:bytes.length,
    tags,notes:`Lightroom edited replacement for ${original.filename}. Original preserved.`,created_at:new Date().toISOString(),
    folder_id:original.folder_id??null,ai_status:null,ai_reason:null,ai_categories:original.ai_categories??[],ai_post_uses:original.ai_post_uses??[],ai_edit_suggestion:null,
  }
  const{error:insertError}=await supabase.from('media_assets').insert(row)
  if(insertError){await supabase.storage.from('media').remove([newPath]);return NextResponse.json({error:insertError.message},{status:500})}

  const{data:eventSource}=await supabase.from('event_media').select('event_id,media_kind').eq('id',original.id).eq('user_id',user.id).maybeSingle()
  if(eventSource?.event_id){
    const previewUrl=supabase.storage.from('media').getPublicUrl(newPath).data.publicUrl
    const{error:eventError}=await supabase.from('event_media').insert({
      id:newId,user_id:user.id,event_id:eventSource.event_id,storage_path:newPath,file_name:newName,file_type:file.type||'image/jpeg',media_kind:'photo',size_bytes:bytes.length,
      thumbnail_path:null,preview_url:previewUrl,checksum:null,metadata:{editedFrom:original.id,editType:'lightroom-roundtrip'}
    })
    if(eventError)return NextResponse.json({error:`Edited photo saved, but event link failed: ${eventError.message}`},{status:500})
  }

  return NextResponse.json({edited:row,originalId:original.id})
}
