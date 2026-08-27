import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM = `You are the media quality reviewer for Fireova, a DFW event catering company known for its mobile wood-fired pizza experience.

CRITICAL BRAND CONTEXT:
Fireova is MORE THAN PIZZA. Never reject or downgrade an image simply because it is not pizza or wood-fired food. The full Fireova catering experience includes wood-fired pizza, grazing and charcuterie tables, appetizers and small bites, salads, hot sides, desserts and dessert shooters, cannolis, team/service moments, guests, weddings, corporate events, private parties, venues, decor, signage, menus, pizza-themed wedding details, the oven/fire, behind-the-scenes preparation, and the overall event experience. All of these are legitimate Fireova social content when the image itself is good.

Your job is to judge MEDIA QUALITY AND CONTENT VALUE, not whether the subject is pizza.

Choose exactly one decision:
- strong: visually strong and useful enough to post as-is.
- edit: worth keeping and posting after a normal photo correction such as exposure, white balance, crop, shadows/highlights, or modest color correction.
- skip: genuinely poor/unusable media, an unflattering moment, bad food presentation/freshness, severe blur, major obstruction, or clearly inferior duplicate. Do not use skip merely because a subject is a side offering, dessert, decor, venue, or team photo.

FIREOVA VISUAL STANDARDS:
- Food must look fresh, appetizing, natural, and correctly colored. Yellow/green casts, stale-looking cheese, dried food, excessive burn, or unflattering food presentation are problems.
- People should look flattering and natural. Avoid awkward expressions, obvious blur, harsh lighting, distracting crops, or caught-off-guard moments.
- Experience content is valuable: guests gathering, team interaction, oven/fire, pizza process, beautiful catering displays, event details, venues, and behind-the-scenes work.
- A useful image that only needs ordinary color/exposure/crop correction is edit, not skip.
- Never recommend altering people's identity/body, changing decor, inventing/removing food, or changing factual event details. Preserve the real event.
- Be selective, but do not confuse selectivity with being pizza-only.

Return ONLY valid JSON:
{"status":"strong|edit|skip","score":0,"reason":"short specific reason about visual/content quality","categories":["..."],"uses":["..."],"edit_suggestion":"specific edit or null"}
Score is 0-100. Categories may include Food, Pizza, Dessert, Small Bites, Charcuterie, People, Team, Experience, Wedding, Corporate, Private Event, Details, Decor, Process, Venue, Oven, Behind the Scenes. Uses should be concrete, such as Feed photo, Carousel opener, Carousel detail, Reel cover, Story, B-roll.`

export async function POST(request: NextRequest) {
  try {
    const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});const apiKey=process.env.ANTHROPIC_API_KEY;if(!apiKey)return Response.json({error:'ANTHROPIC_API_KEY is not configured in Production'},{status:500});const {assetId}=await request.json() as {assetId?:string};if(!assetId)return Response.json({error:'assetId is required'},{status:400});const {data:asset,error}=await supabase.from('media_assets').select('*').eq('id',assetId).eq('user_id',user.id).single();if(error||!asset)return Response.json({error:`Media not found: ${error?.message??'unknown error'}`},{status:404});if(!asset.file_type?.startsWith('image/'))return Response.json({error:'Image analysis only for now'},{status:400});const imageUrl=supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl;const client=new Anthropic({apiKey});let response;try{response=await client.messages.create({model:'claude-sonnet-4-5',max_tokens:700,system:SYSTEM,messages:[{role:'user',content:[{type:'image',source:{type:'url',url:imageUrl}},{type:'text',text:`Review this real Fireova media asset. Filename: ${asset.filename}. Existing tags: ${(asset.tags||[]).join(', ')||'none'}. Judge the image on quality and usefulness across Fireova's FULL catering brand, not pizza relevance. Return only raw JSON.`}]}]})}catch(err:unknown){const msg=err instanceof Error?err.message:'Anthropic API error';return Response.json({error:`Anthropic: ${msg}`},{status:502})}const textBlock=response.content.find(b=>b.type==='text'),raw=textBlock&&textBlock.type==='text'?textBlock.text.trim():'';if(!raw)return Response.json({error:'Anthropic returned no text'},{status:502});let parsed:{status:string;score:number;reason:string;categories:string[];uses:string[];edit_suggestion:string|null};try{parsed=JSON.parse(raw.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim())}catch{return Response.json({error:`Anthropic returned invalid JSON: ${raw.slice(0,180)}`},{status:502})}const status=['strong','edit','skip'].includes(parsed.status)?parsed.status:'skip';const patch={ai_status:status,ai_quality_score:Math.max(0,Math.min(100,Number(parsed.score)||0)),ai_reason:String(parsed.reason||''),ai_categories:Array.isArray(parsed.categories)?parsed.categories.slice(0,8):[],ai_post_uses:Array.isArray(parsed.uses)?parsed.uses.slice(0,6):[],ai_edit_suggestion:parsed.edit_suggestion?String(parsed.edit_suggestion):null,ai_reviewed_at:new Date().toISOString()};const {error:saveError}=await supabase.from('media_assets').update(patch).eq('id',asset.id).eq('user_id',user.id);if(saveError)return Response.json({error:`Supabase save failed: ${saveError.message}`},{status:500});return Response.json({id:asset.id,...patch})
  } catch(err:unknown){const msg=err instanceof Error?err.message:'Unknown server error';return Response.json({error:`Server: ${msg}`},{status:500})}
}
