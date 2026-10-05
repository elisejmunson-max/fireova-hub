export const ANCHOR = '2026-10-05';
export const MONTH = '2026-10';
export const priorityId = number => `10000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
export const clone = value => JSON.parse(JSON.stringify(value));
const captions = [
  'A season at the table. A warm welcome to the week.',
  'The little details. A closer look at the table.',
  'From the kitchen. Good things take care.',
  'A place to gather. Bring someone you love.',
  'Meet the makers. The people behind each plate.',
  'A sweet finish. A little something worth sharing.',
];
export const dates = ['2026-10-05','2026-10-07','2026-10-09','2026-10-12','2026-10-14','2026-10-16'];
const selections = [[1,2],[3],[4,5],[6],[7],[8]];
export function dashboardProps() {
  const initialAssets = Array.from({length:8},(_,index)=>({id:`asset-${index+1}`,storage_path:`fixture-owner/asset-${index+1}.svg`,file_type:'image/svg+xml',filename:`editorial-fixture-${index+1}.svg`,tags:[]}));
  const savedSlots = selections.map((ids,index)=>({draftId:`draft-${index+1}`,planSlotId:`slot-${index+1}`,planningDate:dates[index],planPosition:index,assetIds:ids.map(n=>`asset-${n}`),kind:ids.length>1?'Carousel':'Photo',caption:captions[index],originalCaption:captions[index],purpose:captions[index].split('.')[0]}));
  return {initialAssets,savedSlots,initialPlanCoverage:[],planningAnchor:ANCHOR,planningAvailable:true,initialQueueUpdatedAt:'2026-10-05T00:00:00.000Z',approvedCount:1};
}
export const expectedMedia = selections.map(ids=>`/fixture-media/${encodeURIComponent(`fixture-owner/asset-${ids[0]}.svg`)}`);
export function makePlan(month=MONTH, {priorities, entries, revision=0, truncated=false}={}) {
  return {
    month,
    features:{month,revision,priorities: priorities ?? [{id:priorityId(1),text:'Autumn menu launch'}, {id:priorityId(2),text:'Meet the team'}]},
    entries:entries ?? (month===MONTH ? [
      ...dashboardProps().savedSlots.map((slot,index)=>({id:`draft:${slot.draftId}`,date:slot.planningDate,title:slot.purpose,status:['Draft','Waiting','Revised','Draft','Draft','Draft'][index],draftId:slot.draftId})),
      {id:'post:approved-1',date:'2026-10-22',title:'Our autumn gathering',status:'Approved',postId:'approved-1'},
      {id:'post:scheduled-1',date:'2026-10-25',title:'Sunday at the table',status:'Scheduled',postId:'scheduled-1'},
      {id:'post:published-1',date:'2026-10-01',title:'Welcome October',status:'Published',postId:'published-1'},
    ] : []),
    truncated,
  };
}
export const ORIGIN = 'https://gallery.fixture.test';
export const originalUrl = asset => `/fixture-media/${encodeURIComponent(asset.storage_path)}`;
export function gallerySeed({ placeholders = false } = {}) {
  const dashboard = dashboardProps();
  dashboard.initialAssets = dashboard.initialAssets.map((asset, index) => ({
    ...asset,
    file_type:index === 2 ? 'video/mp4' : 'image/svg+xml',
    filename:index === 2 ? 'The kitchen.mp4' : asset.filename,
    storage_path:index === 2 ? 'fixture-owner/asset-3.mp4' : asset.storage_path,
    created_at:`2026-10-0${8-index}T00:00:00.000Z`,
    user_id:'fixture-owner',
    ai_categories:[],
  }));
  dashboard.savedSlots[1].kind = 'Reel';
  const approved = dashboard.savedSlots.map((slot, index) => ({
    id:`approved-${index+1}`,format:slot.kind,caption:slot.caption,credits:[],sort_order:index,
    media:slot.assetIds.map(id => { const asset=dashboard.initialAssets.find(asset => asset.id === id); return { id,file_type:asset.file_type,url:originalUrl(asset) }; }),
  }));
  if (placeholders) {
    dashboard.savedSlots = dashboard.savedSlots.slice(0, 2);
    dashboard.initialPlanCoverage = [{slotId:'slot-3',position:2,planningDate:'2026-10-09',state:'approved',approvedPostId:'approved-3'}];
  }
  return { dashboard,approved,media:{initialAssets:dashboard.initialAssets,initialCounts:{all:8,photo:7,video:1}} };
}
/** Mixed portrait, landscape, and square originals make preview cropping observable. */
export function gallerySvg(index) {
  const [w,h] = [[1200,675],[675,1200],[900,900]][(index-1)%3];
  const colors = ['#6d543e','#49716a','#52657d','#9f604a','#8f744e','#605969'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${colors[(index-1)%colors.length]}"/><circle cx="${w*.5}" cy="${h*.45}" r="${Math.min(w,h)*.32}" fill="#f0dab3"/><circle cx="${w*.5}" cy="${h*.45}" r="${Math.min(w,h)*.25}" fill="#b86e47"/><path d="M0 ${h*.78}Q${w*.3} ${h*.58} ${w*.65} ${h*.8}T${w} ${h*.7}V${h}H0Z" fill="#293c33"/><text x="${w*.5}" y="${h*.91}" text-anchor="middle" font-family="sans-serif" font-size="${Math.min(w,h)*.045}" fill="#fff7e5">Gallery ${index} · ${w} × ${h}</text></svg>`;
}
