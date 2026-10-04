export type ManualAsset={id:string;storage_path:string;file_type:string;filename?:string;tags?:string[]|null;ai_categories?:string[]|null;ai_reason?:string|null;missing?:boolean};
export type ManualKind='Photo'|'Carousel'|'Reel';
export type RevisionRequest={note:string;requestedAt:string;baseCaption:string;status:'waiting'|'revised';revisedAt?:string};
export type ManualPost={id:string;media:ManualAsset[];kind:ManualKind;purpose?:string;revision?:RevisionRequest};
export type ManualSlot={assetIds:string[];kind:ManualKind;caption:string;originalCaption:string;purpose?:string;revision?:RevisionRequest};

export function restoreManualDrafts(slots:ManualSlot[],assets:ManualAsset[]){
  const byId=new Map(assets.map(a=>[a.id,a])),posts:ManualPost[]=[],captions:Record<string,string>={},originals:Record<string,string>={};
  slots.forEach((slot,index)=>{if(!slot.caption?.trim()||!slot.assetIds.length)return;const media=slot.assetIds.map(id=>byId.get(id)||{id,storage_path:'',file_type:'application/x-missing',missing:true});const postId=`saved-${index}-${slot.assetIds.join('-')}`,revision=isRevision(slot.revision)?slot.revision:undefined;posts.push({id:postId,media,kind:slot.kind,purpose:slot.purpose,...(revision?{revision}:{})});captions[postId]=slot.caption;originals[postId]=slot.originalCaption||slot.caption});
  return{posts,captions,originals};
}

export function serializeManualDrafts(posts:ManualPost[],captions:Record<string,string>,originals:Record<string,string>):ManualSlot[]{
  return posts.filter(post=>captions[post.id]?.trim()).map(post=>({assetIds:post.media.map(asset=>asset.id),kind:post.kind,caption:captions[post.id].trim(),originalCaption:(originals[post.id]||captions[post.id]).trim(),...(post.purpose?{purpose:post.purpose}:{}),...(post.revision?{revision:post.revision}:{})}));
}

export function requestRevision(post:ManualPost,note:string,caption:string,requestedAt:string):ManualPost{return{...post,revision:{note:note.trim(),requestedAt,baseCaption:caption.trim(),status:'waiting'}}}

export function reconcileRevision(post:ManualPost,caption:string,revisedAt:string):ManualPost{if(post.revision?.status!=='waiting'||caption.trim()===post.revision.baseCaption.trim())return post;return{...post,revision:{...post.revision,status:'revised',revisedAt}}}

export function tileMedia(post:ManualPost){return post.media[0]||null}

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
