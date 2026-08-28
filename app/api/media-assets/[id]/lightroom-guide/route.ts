import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_request:Request,{params}:{params:{id:string}}){
 const supabase=createClient() as any
 const{data:{user}}=await supabase.auth.getUser()
 if(!user||user.id==='dev')return NextResponse.json({error:'Unauthorized'},{status:401})
 const{data:asset,error}=await supabase.from('media_assets').select('*').eq('id',params.id).eq('user_id',user.id).single()
 if(error||!asset)return NextResponse.json({error:error?.message||'Photo not found'},{status:404})
 if(!String(asset.file_type||'').startsWith('image/'))return NextResponse.json({error:'Lightroom guidance is for photos only.'},{status:400})
 const key=process.env.ANTHROPIC_API_KEY
 if(!key)return NextResponse.json({error:'AI guidance is not configured.'},{status:500})
 const url=supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
 try{
  const client=new Anthropic({apiKey:key})
  const response=await client.messages.create({model:'claude-sonnet-4-5',max_tokens:850,system:`You are a professional wedding, event, and food photo editor coaching a non-professional user in Lightroom Mobile. Analyze THIS exact photo visually. Give the MINIMUM edits needed to make the real photograph look professionally finished while unmistakably real. Never use a preset recipe. Never recommend an adjustment merely because it is available. Preserve natural lighting differences, real shadows, food colors, skin, decor, venue, and atmosphere. Avoid HDR, crunchy detail, excessive clarity/texture/sharpening, flattened lighting, oversaturation, and an AI/fake look. If the photo is already good in an area, explicitly leave it alone. Use Lightroom Mobile click paths and conservative STARTING slider values. Values are starting points, not guarantees. Prefer 1-4 steps total. Masks only when a local problem truly needs one. End with STOP and name what not to touch. Return ONLY JSON with {"summary":"one sentence","steps":[{"title":"short title","path":"exact Lightroom Mobile path","settings":["slider +value"],"why":"short reason"}],"stop":"what to leave alone / when to stop"}.`,messages:[{role:'user',content:[{type:'image',source:{type:'url',url}},{type:'text',text:`Photo: ${asset.filename}. Existing media-review observation: ${asset.ai_reason||'none'}. Existing edit note: ${asset.ai_edit_suggestion||'none'}. Do a fresh visual Lightroom analysis; do not simply repeat those notes.`}]}]})
  const block=response.content.find(b=>b.type==='text');if(!block||block.type!=='text')throw new Error('No Lightroom guidance returned.')
  const parsed=JSON.parse(block.text.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim())
  return NextResponse.json(parsed)
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not analyze this photo.'},{status:500})}
}
