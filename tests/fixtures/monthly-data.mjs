export const ORIGIN = 'https://monthly-planning.fixture.test';
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
export function mediaSvg(index) {
  const palettes = [['#33271e','#b5753b','#f3e2b8'],['#405141','#abb08b','#eadac0'],['#514134','#a87855','#f2d9ac'],['#262d28','#959264','#e1d5b3'],['#51342e','#ba6950','#eed4b3'],['#3c3327','#a49867','#efe3bc'],['#263735','#758b73','#d9d5ad'],['#533d33','#b88f61','#f4dfb5']];
  const [bg,accent,light] = palettes[(index-1)%palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="${bg}"/><path d="M0 80L800 310V1000H0Z" fill="${accent}" opacity=".35"/><ellipse cx="415" cy="520" rx="285" ry="325" fill="${light}"/><ellipse cx="415" cy="520" rx="238" ry="275" fill="${accent}"/><ellipse cx="415" cy="520" rx="215" ry="250" fill="${bg}"/><path d="M220 460Q420 260 595 525Q460 730 270 650Z" fill="${accent}"/><g fill="${light}" opacity=".9"><ellipse cx="315" cy="465" rx="45" ry="75" transform="rotate(-30 315 465)"/><ellipse cx="468" cy="525" rx="55" ry="90" transform="rotate(24 468 525)"/><ellipse cx="375" cy="640" rx="62" ry="32"/></g><path d="M90 150L130 860M690 200L650 860" stroke="${light}" stroke-width="12" opacity=".55"/><text x="44" y="942" fill="${light}" font-family="Georgia,serif" font-size="31">Editorial fixture · ${String(index).padStart(2,'0')}</text></svg>`;
}
