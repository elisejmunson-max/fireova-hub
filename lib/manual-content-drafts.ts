export type ManualAsset={id:string;storage_path:string;file_type:string;filename?:string;tags?:string[]|null;ai_categories?:string[]|null;ai_reason?:string|null;missing?:boolean};
export type ManualKind='Photo'|'Carousel'|'Reel';
export type RevisionRequest={note:string;requestedAt:string;baseCaption:string;status:'waiting'|'revised';revisedAt?:string};
export type ManualPost={id:string;draftId?:string;planSlotId?:string;planningDate?:string;planPosition?:number;media:ManualAsset[];kind:ManualKind;purpose?:string;revision?:RevisionRequest};
export type ManualSlot={draftId?:string;planSlotId?:string;planningDate?:string;planPosition?:number;assetIds:string[];kind:ManualKind;caption:string;originalCaption:string;purpose?:string;revision?:RevisionRequest};
export type PlanCoverage={slotId:string;position:number;planningDate:string;state:'approved'|'skipped'|'removed';approvedPostId?:string|null};
export type PlanCell={type:'open';position:number}|{type:'draft';post:ManualPost;backlog?:boolean}|{type:'covered';coverage:PlanCoverage};
export type CaptionEditState={editing:boolean;draft:string};
export type ApprovalResponse={slots?:ManualSlot[];coverage?:PlanCoverage[];updatedAt?:string|null};
export const idleCaptionEdit=():CaptionEditState=>({editing:false,draft:''});
export const beginCaptionEdit=(caption:string):CaptionEditState=>({editing:true,draft:caption});
export const updateCaptionEdit=(state:CaptionEditState,draft:string):CaptionEditState=>({...state,draft});
export const cancelCaptionEdit=():CaptionEditState=>idleCaptionEdit();
export const completeCaptionEdit=(persisted:boolean,state:CaptionEditState):CaptionEditState=>persisted?idleCaptionEdit():state;
export const canApproveCaptionEdit=(state:CaptionEditState)=>!state.editing;
export const canNavigateDuringCaptionSave=(saving:boolean)=>!saving;
export const canInteractWithCaptionEdit=(saving:boolean)=>!saving;

export function chicagoPlanningAnchor(value:string|Date){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error('Invalid planning anchor');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),read=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value||'';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function suggestedPlanningDates(anchor:string,count=6){
  const start=new Date(`${anchor}T12:00:00Z`),dates:string[]=[];
  for(let offset=0;dates.length<count&&offset<count*4+7;offset++){const date=new Date(start);date.setUTCDate(start.getUTCDate()+offset);if([1,3,5].includes(date.getUTCDay()))dates.push(date.toISOString().slice(0,10))}
  return dates;
}

function stableLegacyId(prefix:string,index:number,assetIds:string[]){return `${prefix}-${index}-${assetIds.join('-')}`}

export function restoreManualDrafts(slots:ManualSlot[],assets:ManualAsset[],anchor=new Date().toISOString().slice(0,10)){
  const byId=new Map(assets.map(a=>[a.id,a])),posts:ManualPost[]=[],captions:Record<string,string>={},originals:Record<string,string>={};
  const dates=suggestedPlanningDates(anchor,Math.max(6,slots.length));
  slots.forEach((slot,index)=>{if(!slot.caption?.trim()||!slot.assetIds.length)return;const media=slot.assetIds.map(id=>byId.get(id)||{id,storage_path:'',file_type:'application/x-missing',missing:true}),draftId=slot.draftId||stableLegacyId('draft',index,slot.assetIds),planSlotId=slot.planSlotId||stableLegacyId('slot',index,slot.assetIds),planningDate=slot.planningDate||dates[index]||'',planPosition=Number.isInteger(slot.planPosition)?Number(slot.planPosition):index,revision=isRevision(slot.revision)?slot.revision:undefined;posts.push({id:draftId,draftId,planSlotId,planningDate,planPosition,media,kind:slot.kind,purpose:slot.purpose,...(revision?{revision}:{})});captions[draftId]=slot.caption;originals[draftId]=slot.originalCaption||slot.caption});
  return{posts,captions,originals};
}

export function serializeManualDrafts(posts:ManualPost[],captions:Record<string,string>,originals:Record<string,string>):ManualSlot[]{
  return posts.filter(post=>captions[post.id]?.trim()).map((post,index)=>({draftId:post.draftId||post.id,planSlotId:post.planSlotId||`slot-${post.id}`,planningDate:post.planningDate||'',planPosition:Number.isInteger(post.planPosition)?post.planPosition:index,assetIds:post.media.map(asset=>asset.id),kind:post.kind,caption:captions[post.id].trim(),originalCaption:(originals[post.id]||captions[post.id]).trim(),...(post.purpose?{purpose:post.purpose}:{}),...(post.revision?{revision:post.revision}:{})}));
}

export function planCells(posts:ManualPost[],coverage:PlanCoverage[],count=6,anchor?:string):PlanCell[]{
  if(anchor){
    const dates=suggestedPlanningDates(anchor,count),result:PlanCell[]=Array.from({length:count},(_,position)=>({type:'open' as const,position}));
    const currentPosts=posts.filter(post=>!post.planningDate||post.planningDate>=anchor),backlog=posts.filter(post=>Boolean(post.planningDate&&post.planningDate<anchor)).sort((a,b)=>(a.planningDate||'').localeCompare(b.planningDate||'')||(a.planPosition??Number.MAX_SAFE_INTEGER)-(b.planPosition??Number.MAX_SAFE_INTEGER));
    const entries=[...coverage.map(item=>({date:item.planningDate,position:item.position,cell:{type:'covered' as const,coverage:item}})),...currentPosts.map(post=>({date:post.planningDate||'',position:post.planPosition??Number.MAX_SAFE_INTEGER,cell:{type:'draft' as const,post}}))].filter(item=>!item.date||item.date>=anchor).sort((a,b)=>a.date.localeCompare(b.date)||a.position-b.position);
    for(const entry of entries){const dated=dates.indexOf(entry.date),target=dated>=0&&result[dated]?.type==='open'?dated:result.findIndex((cell,index)=>index>=Math.max(0,dated)&&cell.type==='open');if(target>=0)result[target]=entry.cell;else result.push(entry.cell)}
    result.push(...backlog.map(post=>({type:'draft' as const,post,backlog:true})));
    return result;
  }
  const cells=new Map<number,{type:'draft';post:ManualPost}|{type:'covered';coverage:PlanCoverage}>();
  coverage.forEach(item=>{if(item.position>=0)cells.set(item.position,{type:'covered',coverage:item})});
  posts.forEach(post=>{if(typeof post.planPosition==='number'&&post.planPosition>=0)cells.set(post.planPosition,{type:'draft',post})});
  const highest=Math.max(-1,...cells.keys());
  return Array.from({length:Math.max(count,highest+1)},(_,position)=>cells.get(position)||{type:'open' as const,position});
}

export function activePlanCoverage(coverage:PlanCoverage[],anchor:string){return coverage.filter(item=>!item.planningDate||item.planningDate>=anchor)}

export function nextPlanPosition(posts:ManualPost[],coverage:PlanCoverage[]){
  return Math.max(-1,...posts.map(post=>post.planPosition??-1),...coverage.map(item=>item.position))+1;
}

export function nextPlanningDate(posts:ManualPost[],coverage:PlanCoverage[],anchor:string){
  const occupied=new Set([...posts.map(post=>post.planningDate),...coverage.map(item=>item.planningDate)].filter((date):date is string=>typeof date==='string'&&date.length>0&&date>=anchor));
  return suggestedPlanningDates(anchor,Math.max(6,occupied.size+1)).find(date=>!occupied.has(date))||'';
}

export function composeApprovedCaption(caption:string,credits:string[]){
  return [caption.trim(),...credits.map(credit=>credit.trim()).filter(Boolean)].join('\n\nPhoto: ').trim();
}

export function normalizePhotoCredits(value:unknown){
  if(!Array.isArray(value)||value.length>10||value.some(credit=>typeof credit!=='string'||!credit.trim()||credit.length>200||/[\r\n]/.test(credit)))return null;
  return[...new Set(value.map(credit=>credit.trim()))];
}

export function buildApprovalPayload(post:ManualPost,caption:string,originalCaption:string,photoCredits:string[],expectedUpdatedAt:string|null){
  return{assetIds:post.media.map(asset=>asset.id),caption:caption.trim(),photoCredits:normalizePhotoCredits(photoCredits)||[],originalCaption:originalCaption.trim(),format:post.kind,sourceDraftId:post.draftId||post.id,planSlotId:post.planSlotId,planningDate:post.planningDate,planPosition:post.planPosition,expectedUpdatedAt};
}

export function reconcileApprovalResponse(response:ApprovalResponse,assets:ManualAsset[],anchor:string){
  if(!Array.isArray(response.slots)||!Array.isArray(response.coverage)||typeof response.updatedAt!=='string'||!response.updatedAt)return null;
  return{...restoreManualDrafts(response.slots,assets,anchor),coverage:response.coverage,updatedAt:response.updatedAt};
}

export function requestRevision(post:ManualPost,note:string,caption:string,requestedAt:string):ManualPost{return{...post,revision:{note:note.trim(),requestedAt,baseCaption:caption.trim(),status:'waiting'}}}

export function reconcileRevision(post:ManualPost,caption:string,revisedAt:string):ManualPost{if(post.revision?.status!=='waiting'||caption.trim()===post.revision.baseCaption.trim())return post;return{...post,revision:{...post.revision,status:'revised',revisedAt}}}

export function tileMedia(post:ManualPost){return post.media[0]||null}
export function activeManualMedia(post:ManualPost,slide:number){return post.media[slide]||post.media[0]||null}

export function appendManualDraft(current:{posts:ManualPost[];captions:Record<string,string>;originals:Record<string,string>},post:ManualPost,caption:string){
  return{posts:[...current.posts,post],captions:{...current.captions,[post.id]:caption},originals:{...current.originals,[post.id]:caption}};
}

export async function approveOnce(id:string,succeeded:Set<string>,approve:()=>Promise<void>,cleanup:()=>Promise<void>){
  if(!succeeded.has(id)){await approve();succeeded.add(id)}
  await cleanup();
}

export async function runExclusive(lock:{current:boolean},task:()=>Promise<void>){
  if(lock.current)return false;
  lock.current=true;
  try{await task();return true}finally{lock.current=false}
}

function isRevision(value:unknown):value is RevisionRequest{if(!value||typeof value!=='object')return false;const revision=value as Partial<RevisionRequest>;return typeof revision.note==='string'&&Boolean(revision.note.trim())&&typeof revision.requestedAt==='string'&&typeof revision.baseCaption==='string'&&(revision.status==='waiting'||revision.status==='revised')}
