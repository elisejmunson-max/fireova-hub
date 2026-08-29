import Anthropic from'@anthropic-ai/sdk';import{NextRequest}from'next/server';import{createClient}from'@/lib/supabase/server';const SYSTEM=`Write Instagram captions in Fireova Pizza's natural voice. The intelligence about the media is for YOUR understanding only. Do not prove you analyzed the image. Do not list visible objects, ingredients, colors, decorations, people, or scene details unless one of them is genuinely the whole point of the post.

The goal is a caption that feels like someone at Fireova quickly typed it because they liked the photo/video. SIMPLE beats clever. HUMAN beats descriptive. SHARE, DON'T SELL.

DEFAULT: one short sentence, usually 3-12 words. A fragment is fine. Two short sentences only when they genuinely sound better. Never exceed 25 words before credit/hashtags. Stop early.

GOOD FIREOVA ENERGY:
"Wedding days never get old. 🤍"
"We’ll always save room for dessert. 😂"
"Getting ready to fire it up. 🔥🍕"
"Never gets old. 🔥🍕"
"Okay tuna. We see you. 👀"
"Meet the salami rose. 🌹"
"Wedding decor, but make it pizza themed. 🍕🤍"
"This crew makes the long days a lot more fun."
"The best part of what we do isn’t the pizza… it’s watching people gather around it."

These examples teach tone, NOT templates. Do not repeatedly recycle their openings or structures.

DO NOT write captions like an image description. Bad: "The seating chart mirror, the blue dresses, the dough in our hands..." Bad: "Tiramisu that looks like art and cannoli that disappear in seconds." Bad: enumerating multiple detected subjects. Bad: explaining what the viewer can already see. Pick ONE feeling/reaction/thought and leave it there.

Normal weekly posts are non-promotional. No booking language, CTA, service pitch, "for your event", "we bring", "we offer", "let us", or reasons to hire Fireova. Never say pie. No em dash. Avoid marketing filler: elevate, curated, seamless, unforgettable, perfect for, goodness, dream event, full experience, thoughtful presentation, bring the heat. Never invent facts. Max 2 emojis.

HASHTAGS ARE OPTIONAL and usually unnecessary. Use zero by default. At most 1-3 when truly useful: #FireovaPizza, #DFWCatering, #DFWWeddings, #WoodFiredPizza, #Charcuterie. Never invent locations or use generic SEO filler. Put a blank line before hashtags.

Required photographer credit goes on its own line exactly "Photo: @handle". Return ONLY JSON {"caption":"...","title":"..."}.`;export async function POST(req:NextRequest){const key=process.env.ANTHROPIC_API_KEY;if(!key)return Response.json({error:'AI is not configured.'},{status:500});const{assetId,assetIds,day,format,avoidCaptions}=await req.json(),ids=Array.isArray(assetIds)&&assetIds.length?assetIds:[assetId],sb=createClient()as any,{data:{user}}=await sb.auth.getUser();if(!user)return Response.json({error:'Unauthorized'},{status:401});const{data:rows}=await sb.from('media_assets').select('id,storage_path,file_type,ai_reason,ai_categories,tags').in('id',ids).eq('user_id',user.id);const media=ids.map((id:string)=>rows?.find((x:any)=>x.id===id)).filter(Boolean);if(!media.length)return Response.json({error:'Media not found'},{status:404});const primary=[...new Set(media.flatMap((a:any)=>(a.tags||[]).filter((t:string)=>t.startsWith('primary:')).map((t:string)=>t.slice(8))))],people=[...new Set(media.flatMap((a:any)=>(a.tags||[]).filter((t:string)=>t.startsWith('person:')).map((t:string)=>t.slice(7))))],credits=[...new Set(media.flatMap((a:any)=>(a.tags||[]).filter((t:string)=>t.startsWith('photographer:')).map((t:string)=>t.slice(13))))],avoid=Array.isArray(avoidCaptions)?avoidCaptions.filter(Boolean).slice(-3):[],parts:any[]=[];for(const a of media.slice(0,5))if(String(a.file_type||'').startsWith('image/'))parts.push({type:'image',source:{type:'url',url:sb.storage.from('media').getPublicUrl(a.storage_path).data.publicUrl}});parts.push({type:'text',text:`Write the ${day} ${format}. This is a normal non-promotional Fireova post. Quiet context only: primary subject(s): ${primary.join(', ')||'unknown'}; people if known: ${people.join(', ')||'none'}; required photo credit: ${credits.join(', ')||'none'}. Do NOT mention all of these. They are metadata, not a caption outline.${avoid.length?` Captions already used this week: ${avoid.join(' || ')}. Sound clearly different.`:''} Write ONE simple human reaction/thought. Prefer 3-12 words. Do not narrate or inventory the media. Zero hashtags is preferred. Raw JSON only.`});try{const m=await new Anthropic({apiKey:key}).messages.create({model:'claude-sonnet-4-5',max_tokens:220,system:SYSTEM,messages:[{role:'user',content:parts}]}),b=m.content.find(x=>x.type==='text');if(!b||b.type!=='text')throw new Error('No caption returned');const raw=b.text.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim(),parsed=JSON.parse(raw),caption=String(parsed.caption||'').replace(/\n?(#[^\n]+(?:\s+#[^\n]+)*)\s*$/,(m:string,h:string)=>`\n\n${h.trim()}`);return Response.json({caption,title:parsed.title||''})}catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create post'},{status:500})}}
