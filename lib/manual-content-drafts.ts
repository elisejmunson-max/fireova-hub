export type ManualAsset={id:string;storage_path:string;file_type:string;filename?:string;tags?:string[]|null;ai_categories?:string[]|null;ai_reason?:string|null;missing?:boolean};
export type ManualKind='Photo'|'Carousel'|'Reel';
export type ReviewStatus='ready'|'changes_requested';
export type ManualPost={id:string;media:ManualAsset[];kind:ManualKind;purpose?:string;status?:ReviewStatus};
export type ManualSlot={assetIds:string[];kind:ManualKind;caption:string;originalCaption:string;purpose?:string};

export function restoreManualDrafts(slots:ManualSlot[],assets:ManualAsset[]){
  const byId=new Map(assets.map(a=>[a.id,a])),posts:ManualPost[]=[],captions:Record<string,string>={},originals:Record<string,string>={};
  slots.forEach((slot,index)=>{if(!slot.caption?.trim()||!slot.assetIds.length)return;const media=slot.assetIds.map(id=>byId.get(id)||{id,storage_path:'',file_type:'application/x-missing',missing:true});const postId=`saved-${index}-${slot.assetIds.join('-')}`;posts.push({id:postId,media,kind:slot.kind,purpose:slot.purpose,status:'ready'});captions[postId]=slot.caption;originals[postId]=slot.originalCaption||slot.caption});
  return{posts,captions,originals};
}

export function serializeManualDrafts(posts:ManualPost[],captions:Record<string,string>,originals:Record<string,string>):ManualSlot[]{
  return posts.filter(post=>captions[post.id]?.trim()).map(post=>({assetIds:post.media.map(asset=>asset.id),kind:post.kind,caption:captions[post.id].trim(),originalCaption:(originals[post.id]||captions[post.id]).trim(),...(post.purpose?{purpose:post.purpose}:{})}));
}

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
