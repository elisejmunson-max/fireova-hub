/** Synthetic media and review queue only. None of these identities are production data. */
export const ORIGIN = 'https://post-media.fixture.test';
export const OWNER = 'fixture-post-media-owner';
export const INITIAL_REVISION = '2026-10-05T12:00:00.000Z';
export const clone = value => JSON.parse(JSON.stringify(value));
export const assetId = n => `post-media-${String(n).padStart(3,'0')}`;
export function assets() {
  return Array.from({length:32},(_,i)=>{
    const n=i+1,video=n===4||n===29,ext=video?'mp4':'jpg';
    return {id:assetId(n),user_id:OWNER,filename:`fixture-${String(n).padStart(3,'0')}.${ext}`,storage_path:`${OWNER}/${assetId(n)}.${ext}`,file_type:video?'video/mp4':'image/jpeg',size_bytes:100+n,tags:[`subject:${n>24?'later-page':'test-photo'}`,`photographer:Fixture artist ${n}`],ai_categories:[],created_at:`2026-10-05T00:00:${String(60-n).padStart(2,'0')}.000Z`};
  });
}
export function slots() {
  return [
    {draftId:'fixture-draft-photo',planSlotId:'fixture-plan-photo',planningDate:'2026-10-05',planPosition:0,assetIds:[assetId(1)],kind:'Photo',caption:'  A carefully edited caption. Preserve these words exactly.\n ',originalCaption:' Original wording preserved independently.\n',purpose:'Photo fixture',revision:{note:'Keep this saved revision note intact.',requestedAt:'2026-10-04T10:11:12.000Z',baseCaption:'A carefully edited caption. Preserve these words exactly.',status:'waiting'}},
    {draftId:'fixture-draft-carousel',planSlotId:'fixture-plan-carousel',planningDate:'2026-10-07',planPosition:1,assetIds:[assetId(2),assetId(3)],kind:'Carousel',caption:'Carousel fixture caption.',originalCaption:'Carousel original caption.',purpose:'Carousel fixture'},
    {draftId:'fixture-draft-reel',planSlotId:'fixture-plan-reel',planningDate:'2026-10-09',planPosition:2,assetIds:[assetId(4)],kind:'Reel',caption:'Reel fixture caption.',originalCaption:'Reel original caption.',purpose:'Reel fixture'},
  ];
}
export function seed(state) {
  const ids=new Set(state.slots.flatMap(slot=>slot.assetIds));
  return {initialAssets:state.assets.filter(asset=>ids.has(asset.id)),savedSlots:state.slots,initialPlanCoverage:[],planningAnchor:'2026-10-05',planningAvailable:true,initialQueueUpdatedAt:state.updatedAt,approvedCount:0};
}
export function libraryPage(all,{q='',offset=0,limit=24,filter='all'}={}) {
  const matched=all.filter(asset=>[asset.filename,...asset.tags].join(' ').toLowerCase().includes(q.toLowerCase()));
  const photo=matched.filter(asset=>asset.file_type.startsWith('image/')),video=matched.filter(asset=>asset.file_type.startsWith('video/'));
  const filtered=filter==='photo'?photo:filter==='video'?video:matched,items=filtered.slice(offset,offset+limit);
  return {items,total:filtered.length,counts:{all:matched.length,photo:photo.length,video:video.length},hasMore:offset+items.length<filtered.length,nextOffset:offset+items.length};
}
export const svg=id=>`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#738573"/><circle cx="450" cy="460" r="280" fill="#dab78f"/><text x="450" y="1000" fill="#fff" font-family="sans-serif" font-size="36" text-anchor="middle">${id}</text></svg>`;
