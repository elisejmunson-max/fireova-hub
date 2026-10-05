/**
 * Real integrated Create review + Edit media components, entirely synthetic data.
 * No Next server, credentials, production reads, database changes, or publication.
 * Every request is fulfilled/aborted at the fake origin below; unknown requests fail.
 * Run: npm run test:post-media-editor:browser
 * CI: npx playwright install --with-deps chromium
 * Optional: CHROMIUM_PATH=/usr/bin/chromium POST_MEDIA_EVIDENCE_DIR=/artifact/path
 * Compile only: node tests/post-media-editor-browser.mjs --build-only
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {ORIGIN,OWNER,INITIAL_REVISION,assets,slots,seed,libraryPage,assetId,clone,svg} from './fixtures/post-media-data.mjs';
const require=createRequire(import.meta.url);
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(repo,'tests/fixtures');
const evidence=path.resolve(process.env.POST_MEDIA_EVIDENCE_DIR||path.join(repo,'../evidence/post-media'));
await fs.mkdir(evidence,{recursive:true});
const bundled=await build({entryPoints:[path.join(fixture,'post-media-browser-entry.tsx')],outdir:path.join(evidence,'bundle'),bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-only-platform-adapters',setup(builder){
  builder.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:path.join(fixture,'post-media-supabase.ts')}));
  builder.onResolve({filter:/^next\/link$/},()=>({path:path.join(fixture,'gallery-link.tsx')}));
  builder.onResolve({filter:/^next\/navigation$/},()=>({path:path.join(fixture,'gallery-navigation.ts')}));
}}]});
const js=Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.js')).contents);
const moduleCss=Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.contents||'');
const postcss=require('postcss'),tailwind=require('tailwindcss'),loadConfig=require('tailwindcss/loadConfig');
const globals=(await postcss([tailwind({...loadConfig(path.join(repo,'tailwind.config.ts')),content:[path.join(repo,'app/**/*.{js,ts,jsx,tsx,mdx}'),path.join(repo,'components/**/*.{js,ts,jsx,tsx,mdx}'),path.join(fixture,'post-media-browser-entry.tsx')]})]).process(await fs.readFile(path.join(repo,'app/globals.css'),'utf8'),{from:path.join(repo,'app/globals.css')})).css;
const css=Buffer.concat([Buffer.from(globals),Buffer.from('\n'),moduleCss]);
const video=await fs.readFile(path.join(fixture,'media-bank-video.mp4'));
const sources=['app/(app)/dashboard/weekly-content-persistent.tsx','app/(app)/dashboard/post-media-editor.tsx','lib/post-media-editor.ts','tests/post-media-editor-browser.mjs','tests/fixtures/post-media-browser-entry.tsx','tests/fixtures/post-media-data.mjs','tests/fixtures/post-media-supabase.ts','app/globals.css'];
const sourceSha256={};for(const source of sources)sourceSha256[source]=createHash('sha256').update(await fs.readFile(path.join(repo,source))).digest('hex');
const buildEvidence={sourceSha256,bundleSha256:createHash('sha256').update(js).digest('hex'),bundleBytes:js.length,cssBytes:css.length,actualIntegratedComponentsBundled:true,actualTailwindCompiled:true};
await fs.writeFile(path.join(evidence,'post-media-static-report.json'),JSON.stringify({status:'passed',...buildEvidence,browserScenariosExecuted:0},null,2));
if(process.argv.includes('--build-only')){console.log('PASS actual review + Edit media components and production CSS compile; browser not run.');process.exit(0);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check,message,timeout=8000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){try{if(await check())return;}catch(error){last=error;}await sleep(30);}throw new Error(`${message}${last?`: ${last.message}`:''}`);}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const selection=page=>page.getByLabel('Post media',{exact:true});
const selectedIds=page=>selection(page).locator('[data-media-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-media-id')));
const bankButton=(page,n)=>button(page,`Select fixture-${String(n).padStart(3,'0')}.${n===4||n===29?'mp4':'jpg'}`);
const currentDialog=page=>page.getByRole('dialog');
async function openPost(page,name='Photo fixture'){await page.locator('.editorial-grid').getByRole('button',{name:new RegExp(name)}).click();await currentDialog(page).waitFor();}
async function openEditor(page){await button(page,'Edit media').click();await selection(page).waitFor();await page.getByLabel('Choose from Media Bank',{exact:true}).getByRole('button').first().waitFor();}
async function save(page,state,count=1){await button(page,'Save media').click();await eventually(()=>state.saves.length===count,'media save request');await eventually(()=>button(page,'Cancel media edits').count().then(count=>count===0),'successful Save closes editor');await eventually(()=>button(page,'Edit media').evaluate(element=>element===document.activeElement),'Save restores focus to Edit media');}
async function closePost(page){await button(page,'Close post details').click();await currentDialog(page).waitFor({state:'hidden'});}
async function assertSelected(page,ids,message='selected media order'){assert.deepEqual(await selectedIds(page),ids,message);}
async function assertUnchanged(state,before,index=0){const actual=clone(state.slots[index]),expected=clone(before[index]);delete actual.assetIds;delete actual.kind;delete expected.assetIds;delete expected.kind;assert.deepEqual(actual,expected,'only media IDs and format may change');for(let i=0;i<before.length;i++)if(i!==index)assert.deepEqual(state.slots[i],before[i],'other post unchanged');}
async function screenshot(page,name){await page.screenshot({path:path.join(evidence,name),fullPage:false});screenshots.push(name);}
const results=[],traces=[],screenshots=[];let browser,launchError;
async function scenario(name,fn,options={}){
  const context=await browser.newContext({viewport:options.viewport||{width:1280,height:900},serviceWorkers:'block'});
  const state={assets:assets(),slots:slots(),updatedAt:INITIAL_REVISION,saves:[],queries:[],uploads:[],storage:[],posters:[],completions:[],requests:[],unexpected:[],errors:[],phase:'initial',counter:0,releaseSave:null,releaseUpload:null,releaseLibrary:null,libraryFailures:0};
  if(options.missing)state.assets=state.assets.filter(asset=>asset.id!==assetId(1));
  if(options.tenPhotos){state.slots[0].assetIds=[1,2,3,5,6,7,8,9,10,11].map(assetId);state.slots[0].kind='Carousel';}
  const initialSlots=clone(state.slots),requestRows=new WeakMap();
  context.on('request',request=>{const row={method:request.method(),url:request.url(),resourceType:request.resourceType(),phase:state.phase,requestBodyBytes:request.postDataBuffer()?.length||0};state.requests.push(row);requestRows.set(request,row);});
  context.on('requestfailed',request=>{const row=requestRows.get(request);if(row)row.failure=request.failure()?.errorText;});
  async function respond(route,status,data,type='application/json'){
    const row=requestRows.get(route.request()),body=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data));if(row)Object.assign(row,{status,responseBodyBytes:body.length});
    try{await route.fulfill({status,contentType:type,headers:{'Cache-Control':'no-store'},body});}catch(error){if(row)row.fulfillError=error.message;}
  }
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),pathname=url.pathname;
    if(url.origin!==ORIGIN){state.unexpected.push(`${request.method()} ${request.url()}`);await route.abort('blockedbyclient');return;}
    if(pathname==='/app.js')return respond(route,200,js,'text/javascript');
    if(pathname==='/app.css')return respond(route,200,css,'text/css');
    if(pathname==='/favicon.ico')return respond(route,204,'','image/x-icon');
    if(pathname==='/dashboard'&&request.method()==='GET')return respond(route,200,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.__POST_MEDIA_FIXTURE__=${JSON.stringify(seed(state)).replaceAll('<','\\u003c')}</script><script src="/app.js"></script></body></html>`,'text/html');
    if(pathname==='/api/monthly-plan'&&request.method()==='GET')return respond(route,200,{month:url.searchParams.get('month')||'2026-10',features:{month:'2026-10',revision:0,priorities:[]},entries:[],truncated:false});
    if(pathname==='/api/media-bank/library'&&request.method()==='GET'){
      const query={q:url.searchParams.get('q')||'',offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||24),filter:url.searchParams.get('filter')||'all'};state.queries.push(query);
      if(options.failLibrary&&state.libraryFailures++===0)return respond(route,503,{error:'Fixture Media Bank temporarily unavailable'});
      if(query.q==='slow-query')await new Promise(resolve=>{state.releaseLibrary=resolve;});
      const data=libraryPage(state.assets,{...query,q:query.q==='slow-query'?'':query.q});
      if(options.duplicatePage&&query.offset>0)data.items=[state.assets[23],...data.items];
      return respond(route,200,data);
    }
    if(pathname.startsWith('/api/media-bank/thumbnail/')&&request.method()==='GET')return respond(route,200,svg(pathname.split('/').at(-1)),'image/svg+xml');
    if(pathname.startsWith('/fixture-original/')&&request.method()==='GET'){
      const storagePath=decodeURIComponent(pathname.slice('/fixture-original/'.length));const asset=state.assets.find(asset=>asset.storage_path===storagePath);
      return asset?respond(route,200,asset.file_type.startsWith('video/')?video:svg(asset.id),asset.file_type.startsWith('video/')?'video/mp4':'image/svg+xml'):respond(route,404,{error:'Fixture asset missing'});
    }
    if(pathname==='/api/review-queue'&&request.method()==='POST'){
      const body=request.postDataJSON();state.saves.push(clone(body));
      if(options.holdSave)await new Promise(resolve=>{state.releaseSave=resolve;});
      if(options.failSave)return respond(route,options.failSave,{error:options.failSave===409?'This review queue changed in another window. Refresh before saving.':'Fixture queue temporarily unavailable'});
      if(body.expectedUpdatedAt!==state.updatedAt)return respond(route,409,{error:'Fixture CAS conflict'});
      state.slots=clone(body.slots);state.updatedAt=`2026-10-05T12:00:${String(state.saves.length).padStart(2,'0')}.000Z`;
      return respond(route,200,{ok:true,updatedAt:state.updatedAt});
    }
    if(pathname==='/api/media-bank/upload'&&request.method()==='POST'){
      const body=request.postDataJSON();
      if(body.action==='start'){
        state.uploads.push(clone(body));
        if(options.failStart)return respond(route,503,{error:'Fixture upload authorization unavailable'});
        const duplicates=[],uploads=[],seen=new Set();
        for(const file of body.files){const key=`${file.name.toLowerCase()}|${file.size}`;if(seen.has(key)||file.name.startsWith('duplicate')||state.assets.some(asset=>asset.filename.toLowerCase()===file.name.toLowerCase()&&asset.size_bytes===file.size)){duplicates.push(file.name);continue;}seen.add(key);const id=`fixture-upload-${++state.counter}`;uploads.push({...file,id,path:`${OWNER}/library/${id}-${file.name}`,token:`fixture-token-${id}`});}
        return respond(route,200,{uploads,duplicates});
      }
      if(body.action==='complete'){
        state.completions.push(clone(body));
        if(options.failComplete)return respond(route,503,{error:'Fixture upload completion unavailable'});
        const saved=body.files.map(file=>({id:file.id,filename:file.name,file_type:file.type,size_bytes:file.size,storage_path:file.path,user_id:OWNER,tags:[],created_at:'2026-10-05T18:00:00.000Z',ai_categories:[]}));
        state.assets.unshift(...saved);return respond(route,200,{assets:saved});
      }
    }
    if(pathname.startsWith('/fixture-signed-upload/')&&request.method()==='PUT'){
      const storagePath=decodeURIComponent(pathname.slice('/fixture-signed-upload/'.length));const body=request.postDataBuffer();state.storage.push({path:storagePath,bytes:body?.length||0,contentType:request.headers()['content-type'],token:request.headers()['x-fixture-upload-token']});
      if(options.holdUpload)await new Promise(resolve=>{state.releaseUpload=resolve;});
      return respond(route,storagePath.includes('storage-fail')?503:200,{ok:!storagePath.includes('storage-fail')});
    }
    if(pathname.startsWith('/api/media-bank/poster/')&&request.method()==='POST'){
      const bytes=request.postDataBuffer()||Buffer.alloc(0),dimensions=await sharp(bytes).metadata();state.posters.push({id:pathname.split('/').at(-1),bytes:bytes.length,width:dimensions.width,height:dimensions.height,format:dimensions.format,contentType:request.headers()['content-type']});return respond(route,options.failPoster?503:201,{ok:!options.failPoster});
    }
    state.unexpected.push(`${request.method()} ${request.url()}`);return respond(route,418,{error:'Unexpected fixture request blocked'});
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>state.errors.push(error.message));
  try{
    await page.goto(`${ORIGIN}/dashboard`);await page.getByRole('heading',{name:'Your next two weeks'}).waitFor();
    await fn({page,state,context,initialSlots});
    assert.deepEqual(state.unexpected,[],'all network must be fake-only and explicitly covered; approval/publishing must never fire');
    assert.deepEqual(state.errors,[],'no uncaught production component errors');
    results.push({name,status:'passed',assertions:state.assertions||[]});console.log(`PASS ${name}`);
  }catch(error){results.push({name,status:'failed',error:error.stack});console.error(`FAIL ${name}: ${error.message}`);try{await screenshot(page,`${name}-FAIL.png`);}catch{}}
  finally{state.releaseSave?.();state.releaseUpload?.();state.releaseLibrary?.();traces.push({scenario:name,...state,releaseSave:undefined,releaseUpload:undefined,releaseLibrary:undefined});await context.close();}
}
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  await scenario('bank-selection-reorder-remove-save-reopen',async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await assertSelected(page,[assetId(1)]);assert.equal(await button(page,'Save or cancel media edits first').isDisabled(),true,'approval disabled throughout media editing');
    await bankButton(page,2).click();await bankButton(page,3).click();await assertSelected(page,[1,2,3].map(assetId));
    await button(page,'Move media 3 earlier').click();await assertSelected(page,[1,3,2].map(assetId));
    await button(page,'Move media 1 later').click();await assertSelected(page,[3,1,2].map(assetId));
    await button(page,'Remove media 2').click();await assertSelected(page,[3,2].map(assetId));
    assert.equal(state.saves.length,0,'staging never writes review queue');
    await screenshot(page,'desktop-reorder-before-save.png');await button(page,'Save media').scrollIntoViewIfNeeded();await screenshot(page,'desktop-editor-save-controls.png');await save(page,state);
    assert.deepEqual(state.slots[0].assetIds,[3,2].map(assetId));assert.equal(state.slots[0].kind,'Carousel');assert.equal(state.saves[0].expectedUpdatedAt,INITIAL_REVISION);await assertUnchanged(state,initialSlots);
    await closePost(page);await openPost(page);await openEditor(page);await assertSelected(page,[3,2].map(assetId));await button(page,'Cancel media edits').click();
    await page.reload();await openPost(page);await openEditor(page);await assertSelected(page,[3,2].map(assetId));
    state.assertions=['bank selection is staged','earlier/later order and remove are persisted','Photo becomes Carousel','caption/original/revision/identities/plan and all other posts unchanged','reopen and reload use persisted new order'];
  });
  await scenario('cancel-and-navigation-discard-unsaved-media',async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await bankButton(page,2).click();await button(page,'Cancel media edits').click();
    assert.equal(await button(page,'Save media').count(),0);await eventually(()=>button(page,'Edit media').evaluate(element=>element===document.activeElement),'Cancel restores Edit media focus');await openEditor(page);await assertSelected(page,[assetId(1)]);
    await bankButton(page,3).click();await closePost(page);await openPost(page);await openEditor(page);await assertSelected(page,[assetId(1)]);
    await bankButton(page,2).click();await page.goBack();await currentDialog(page).waitFor({state:'hidden'});await page.goForward();await currentDialog(page).waitFor();
    assert.equal(await button(page,'Save media').count(),0,'Forward cannot resurrect staged edits');await openEditor(page);await assertSelected(page,[assetId(1)]);
    await bankButton(page,3).click();await currentDialog(page).locator('aside').getByRole('button',{name:/Carousel fixture/}).click();
    await button(page,'Edit media').waitFor();await openEditor(page);await assertSelected(page,[2,3].map(assetId));
    assert.equal(state.saves.length,0);assert.deepEqual(state.slots,initialSlots);
    state.assertions=['Cancel restores original selection','Close and Back discard staged media','Forward restores saved detail only','switching posts does not transfer editor state','no queue writes'];
  });
  await scenario('photo-carousel-reel-format-transitions',async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await bankButton(page,2).click();await save(page,state);assert.equal(state.slots[0].kind,'Carousel');
    await openEditor(page);await button(page,'Remove media 2').click();await save(page,state,2);assert.equal(state.slots[0].kind,'Photo');
    await openEditor(page);await button(page,'Video Reel').click();await assertSelected(page,[]);await bankButton(page,4).click();await save(page,state,3);assert.equal(state.slots[0].kind,'Reel');assert.deepEqual(state.slots[0].assetIds,[assetId(4)]);
    await openEditor(page);await button(page,'Photos / carousel').click();await assertSelected(page,[]);await bankButton(page,3).click();await save(page,state,4);assert.equal(state.slots[0].kind,'Photo');assert.deepEqual(state.slots[0].assetIds,[assetId(3)]);
    assert.equal(state.saves[1].expectedUpdatedAt,'2026-10-05T12:00:01.000Z','subsequent saves use newest CAS version');await assertUnchanged(state,initialSlots);
    state.assertions=['one photo = Photo; two photos = Carousel','last removal returns Carousel to Photo','explicit video switch clears incompatible photos','Reel returns to Photo through explicit switch','CAS revision advances across repeated saves'];
  });
  await scenario('empty-mixed-and-ten-photo-guards',async({page,state})=>{
    await openPost(page);await openEditor(page);await button(page,'Remove media 1').click();await assertSelected(page,[]);assert.equal(await button(page,'Save media').isDisabled(),true);
    await bankButton(page,1).click();
    const video=bankButton(page,4);if(await video.count()){assert.equal(await video.isDisabled(),true,'video cannot silently replace selected photos');}
    for(const n of [2,3,5,6,7,8,9,10,11])await bankButton(page,n).click();await assertSelected(page,[1,2,3,5,6,7,8,9,10,11].map(assetId));
    await bankButton(page,12).click();assert.equal((await selectedIds(page)).length,10,'11th photo cannot be selected');await save(page,state);assert.equal(state.slots[0].assetIds.length,10);
    await openEditor(page);await button(page,'Video Reel').click();await bankButton(page,4).click();
    if(await bankButton(page,1).count())assert.equal(await bankButton(page,1).isDisabled(),true,'photo cannot silently replace Reel');
    await bankButton(page,29).waitFor();await bankButton(page,29).click();assert.equal((await selectedIds(page)).length,1,'only one video may remain selected');await save(page,state,2);assert.equal(state.slots[0].kind,'Reel');assert.equal(state.slots[0].assetIds.length,1);
    state.assertions=['empty selection cannot Save','mixed image/video selection prevented','at most 10 photos','only one video','format stored matches selected media'];
  });
  await scenario('whole-bank-pagination-search-deduplication',async({page,state})=>{
    await openPost(page);await openEditor(page);assert.equal(state.queries[0].offset,0);assert.equal(state.queries[0].limit,24);
    assert.equal(await bankButton(page,31).count(),0);await button(page,'Load more media').click();await bankButton(page,31).waitFor();assert.equal(await bankButton(page,24).count(),1,'duplicate page rows do not produce duplicate cards');await bankButton(page,31).click();
    // Asset 32 already exists in the paginated grid. Its presence alone cannot
    // establish that the debounced search response has replaced those old rows.
    const searched=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/media-bank/library'&&url.searchParams.get('q')==='fixture-032'&&url.searchParams.get('offset')==='0'&&response.status()===200;});
    await page.getByRole('textbox',{name:/Search.*[Mm]edia/}).fill('fixture-032');await searched;
    await eventually(async()=>await bankButton(page,32).count()===1&&await page.getByLabel('Choose from Media Bank',{exact:true}).getByRole('button').count()===1,'latest whole-bank search replaces the paginated grid with its one match');
    assert.equal(await bankButton(page,1).count(),0);await assertSelected(page,[1,31].map(assetId));await bankButton(page,32).click();await save(page,state);assert.deepEqual(state.slots[0].assetIds,[1,31,32].map(assetId));
    assert(state.queries.some(query=>query.offset===24));assert(state.queries.some(query=>query.q==='fixture-032'&&query.offset===0));
    state.assertions=['library query fetches 24 at a time','later-page assets can be selected despite missing from initial dashboard props','duplicate pagination rows are deduplicated','whole-bank search resets cursor without losing selection'];
  },{duplicatePage:true});
  await scenario('library-failure-retry-and-stale-search',async({page,state})=>{
    await openPost(page);await button(page,'Edit media').click();await page.getByText('Fixture Media Bank temporarily unavailable',{exact:true}).waitFor();await button(page,'Retry Media Bank').click();await bankButton(page,1).waitFor();
    const search=page.getByRole('textbox',{name:/Search.*[Mm]edia/});await search.fill('slow-query');await eventually(()=>typeof state.releaseLibrary==='function','old query held');await search.fill('fixture-032');await bankButton(page,32).waitFor();state.releaseLibrary();await sleep(150);assert.equal(await bankButton(page,1).count(),0,'stale result cannot overwrite newer query');
    state.assertions=['library failure is actionable and retries','old search response is ignored after newer search','queue untouched'];assert.equal(state.saves.length,0);
  },{failLibrary:true});
  await scenario('photo-upload-signed-lifecycle-and-save',async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);const file={name:'fresh-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,217])};await page.getByLabel('Upload photos or video').setInputFiles(file);
    await eventually(()=>state.completions.length===1,'upload complete called');await eventually(()=>selectedIds(page).then(ids=>ids.includes('fixture-upload-1')),'saved upload joins staged selection');
    assert.equal(state.uploads[0].action,'start');assert.deepEqual(state.uploads[0].files,[{name:file.name,type:file.mimeType,size:file.buffer.length}]);assert.equal(state.storage.length,1);assert.equal(state.storage[0].bytes,file.buffer.length);assert(state.storage[0].token.startsWith('fixture-token-'));assert.equal(state.saves.length,0);
    await save(page,state);assert.deepEqual(state.slots[0].assetIds,[assetId(1),'fixture-upload-1']);assert.equal(state.slots[0].kind,'Carousel');await assertUnchanged(state,initialSlots);
    await screenshot(page,'desktop-upload-saved.png');state.assertions=['existing upload start → signed storage → complete flow','exact original bytes retained','new bank asset staged without premature queue write','Save attaches upload with existing photo and preserves unrelated draft fields'];
  });
  await scenario('video-upload-and-cancel-retains-bank',async({page,state,initialSlots})=>{
    await openPost(page,'Reel fixture');await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles({name:'fresh-video.mp4',mimeType:'video/mp4',buffer:video});
    await eventually(()=>selectedIds(page).then(ids=>ids.join(',')==='fixture-upload-1'),'uploaded video replaces staged Reel only');assert.equal(state.storage[0].bytes,video.length);assert.equal(state.completions[0].files[0].type,'video/mp4');assert.equal(state.posters.length,1);const poster=state.posters[0];assert.equal(poster.id,'fixture-upload-1');assert.equal(poster.contentType,'image/jpeg');assert.equal(poster.format,'jpeg');assert(poster.bytes>0&&poster.bytes<=256*1024);assert(poster.width<=480&&poster.height<=480);assert.equal(await page.getByLabel('Choose from Media Bank',{exact:true}).locator('video').count(),0,'picker uses lightweight posters');
    await button(page,'Cancel media edits').click();assert.deepEqual(state.slots,initialSlots);assert.equal(state.saves.length,0);assert(state.assets.some(asset=>asset.id==='fixture-upload-1'),'cancel preserves successful Media Bank upload');
    await openEditor(page);await assertSelected(page,[assetId(4)]);await button(page,'Select fresh-video.mp4').waitFor();await button(page,'Select fresh-video.mp4').click();await save(page,state);assert.equal(state.slots[2].kind,'Reel');assert.deepEqual(state.slots[2].assetIds,['fixture-upload-1']);
    state.assertions=['real fixture MP4 uploaded through signed flow','uploaded Reel staged as a single video','Cancel leaves saved post unchanged and retains bank upload','retained upload can be selected and saved later'];
  });
  await scenario('video-poster-failure-retains-uploaded-original',async({page,state})=>{
    await openPost(page,'Reel fixture');await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles({name:'video-without-preview.mp4',mimeType:'video/mp4',buffer:video});
    await eventually(()=>selectedIds(page).then(ids=>ids.join(',')==='fixture-upload-1'),'original survives poster failure');await page.getByText(/video preview is unavailable; the original is uploaded/).waitFor();assert.equal(state.posters.length,1);assert.equal(state.storage.length,1);assert.equal(state.assets.filter(asset=>asset.id==='fixture-upload-1').length,1);await save(page,state);assert.deepEqual(state.slots[2].assetIds,['fixture-upload-1']);
    state.assertions=['poster API failure is non-fatal','saved original remains staged and usable','warning describes missing preview','Save can still attach Reel'];
  },{failPoster:true});
  await scenario('invalid-and-overlimit-uploads-stop-before-start',async({page,state})=>{
    await openPost(page);await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles({name:'eleventh-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('photo')});await page.getByText(/Remove a photo before uploading more/).waitFor();assert.equal(state.uploads.length,0);await assertSelected(page,[1,2,3,5,6,7,8,9,10,11].map(assetId));
    await page.getByLabel('Upload photos or video').setInputFiles({name:'incompatible.mp4',mimeType:'video/mp4',buffer:video});await page.getByText('Choose photos only, or switch to Video Reel.').waitFor();assert.equal(state.uploads.length,0);assert.equal(state.saves.length,0);
    state.assertions=['upload beyond carousel capacity rejected before authorization/storage','wrong-media upload rejected before any writes','existing ten photos retained'];
  },{tenPhotos:true});
  await scenario('upload-lock-keeps-editor-and-post-stable',async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await page.getByLabel('Upload photos or video').evaluate(input=>{
      const files=new DataTransfer();files.items.add(new File(['fixture'],'held-upload.jpg',{type:'image/jpeg'}));
      input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    });await eventually(()=>typeof state.releaseUpload==='function','signed upload pending');assert.equal(state.uploads.length,1,'same-tick upload event duplication locked');assert.equal(state.storage.length,1);assert.equal(await button(page,'Cancel media edits').isDisabled(),true);assert.equal(await button(page,'Save or cancel media edits first').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await currentDialog(page).isVisible(),true);await page.goBack();assert.equal(await currentDialog(page).isVisible(),true);assert.deepEqual(state.slots,initialSlots);
    state.releaseUpload();await eventually(()=>selectedIds(page).then(ids=>ids.includes('fixture-upload-1')),'pending upload settles in same editor');assert.equal(state.completions.length,1);assert.equal(state.saves.length,0);await button(page,'Cancel media edits').click();assert.deepEqual(state.slots,initialSlots);
    state.assertions=['upload lock rejects duplicate same-tick input events','Cancel, approval, Escape and Back guarded during upload','upload completion stages result once without saving post','Cancel after completion keeps original post'];
  },{holdUpload:true});
  await scenario('partial-upload-storage-failure',async({page,state})=>{
    await openPost(page);await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles([{name:'good-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('good')},{name:'storage-fail.jpg',mimeType:'image/jpeg',buffer:Buffer.from('bad')}]);
    await eventually(()=>state.completions.length===1,'successful files complete despite failed peer');await eventually(()=>selectedIds(page).then(ids=>ids.includes('fixture-upload-1')),'successful file remains selectable');
    assert.equal(state.storage.length,2);assert.deepEqual(state.completions[0].files.map(file=>file.name),['good-photo.jpg']);assert.equal(state.assets.some(asset=>asset.filename==='storage-fail.jpg'),false);await page.getByText(/storage-fail.jpg: Fixture storage upload failed/).waitFor();
    await save(page,state);assert.deepEqual(state.slots[0].assetIds,[assetId(1),'fixture-upload-1']);state.assertions=['partial storage failure completes only successful originals','failed file never attaches to draft','successful peer retained and can Save','failure visible'];
  });
  for(const phase of ['start','complete'])await scenario(`upload-${phase}-failure-keeps-editor`,async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles({name:'failed-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('test')});
    await page.getByText(phase==='start'?'Fixture upload authorization unavailable':/Fixture upload completion unavailable/).waitFor();await assertSelected(page,[assetId(1)]);assert.deepEqual(state.slots,initialSlots);assert.equal(state.saves.length,0);assert.equal(state.assets.length,32);assert.equal(await button(page,'Cancel media edits').isEnabled(),true);if(phase==='start')assert.equal(state.storage.length,0);else assert.equal(state.storage.length,1);
    state.assertions=[`${phase} failure is visible`,'uncompleted media never added','saved post unchanged','editor becomes interactive for retry/cancel'];
  },{[phase==='start'?'failStart':'failComplete']:true});
  await scenario('duplicate-upload-skips-without-queue-write',async({page,state})=>{
    await openPost(page);await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles([{name:'duplicate-existing.jpg',mimeType:'image/jpeg',buffer:Buffer.from('duplicate')},{name:'new-unique.jpg',mimeType:'image/jpeg',buffer:Buffer.from('new')}]);
    await eventually(()=>state.completions.length===1,'nonduplicate completes');await eventually(()=>selectedIds(page).then(ids=>ids.includes('fixture-upload-1')),'unique upload staged');assert.equal(state.storage.length,1);assert.equal(state.completions[0].files.length,1);await page.getByText(/already in Media Bank; search for/).waitFor();assert.equal(state.saves.length,0);await button(page,'Cancel media edits').click();
    await openEditor(page);await page.getByLabel('Upload photos or video').setInputFiles({name:'duplicate-only.jpg',mimeType:'image/jpeg',buffer:Buffer.from('duplicate')});await eventually(()=>state.uploads.length===2,'duplicate-only request handled');await eventually(()=>button(page,'Cancel media edits').isEnabled(),'duplicate-only restores controls');assert.equal(state.storage.length,1);assert.equal(state.completions.length,1);await assertSelected(page,[assetId(1)]);
    state.assertions=['duplicates skip storage and completion','nonduplicate peer succeeds','duplicate-only batch settles without phantom selected media or writes'];
  });
  for(const status of [409,503])await scenario(`save-${status}-retains-staged-state`,async({page,state,initialSlots})=>{
    await openPost(page);await openEditor(page);await bankButton(page,2).click();await button(page,'Save media').click();await page.getByRole('alert').waitFor();await assertSelected(page,[1,2].map(assetId));assert.equal(await button(page,'Save media').isEnabled(),true);assert.deepEqual(state.slots,initialSlots);assert.equal(state.saves.length,1);assert.equal(state.saves[0].expectedUpdatedAt,INITIAL_REVISION);await screenshot(page,`save-${status}-preserved.png`);await button(page,'Cancel media edits').click();await openEditor(page);await assertSelected(page,[assetId(1)]);
    state.assertions=[`${status} save failure preserves selected unsaved media`,'saved post never changes optimistically','Save unlocks; Cancel restores original','CAS timestamp included'];
  },{failSave:status});
  await scenario('double-save-lock-and-pending-navigation',async({page,state})=>{
    await openPost(page);await openEditor(page);await bankButton(page,2).click();
    await button(page,'Save media').evaluate(element=>{element.click();element.click();});await eventually(()=>typeof state.releaseSave==='function','Save waiting on fixture server');assert.equal(state.saves.length,1,'same-tick double Save creates one request');assert.equal(await button(page,'Cancel media edits').isDisabled(),true);
    await page.keyboard.press('Escape');assert.equal(await currentDialog(page).isVisible(),true,'pending Save blocks Escape navigation');await page.goBack();assert.equal(await currentDialog(page).isVisible(),true,'pending Save blocks Back navigation');
    state.releaseSave();await eventually(()=>button(page,'Cancel media edits').count().then(count=>count===0),'single save finishes');assert.equal(state.saves.length,1);assert.deepEqual(state.slots[0].assetIds,[1,2].map(assetId));
    state.assertions=['same-tick duplicate Save suppressed','pending save disables cancel and blocks Escape/Back','one success commits once and returns to normal detail'];
  },{holdSave:true});
  await scenario('missing-original-can-be-repaired',async({page,state})=>{
    await openPost(page);await openEditor(page);await assertSelected(page,[assetId(1)]);assert.equal(await button(page,'Save media').isDisabled(),true,'unavailable media cannot save');await button(page,'Remove media 1').click();await bankButton(page,2).click();await save(page,state);assert.deepEqual(state.slots[0].assetIds,[assetId(2)]);assert.equal(state.slots[0].kind,'Photo');
    state.assertions=['missing source identity survives open','invalid missing media cannot Save','replace missing asset repairs post without replacing caption or plan'];
  },{missing:true});
  await scenario('mobile-keyboard-focus-and-controls',async({page,state})=>{
    await openPost(page);assert.equal(await currentDialog(page).getAttribute('aria-modal'),'true');assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');await openEditor(page);
    await bankButton(page,2).press('Enter');await assertSelected(page,[1,2].map(assetId));await button(page,'Move media 2 earlier').press('Enter');await assertSelected(page,[2,1].map(assetId));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile document overflow');
    await selection(page).scrollIntoViewIfNeeded();await screenshot(page,'mobile-390-selected-media.png');
    for(const name of ['Move media 1 later','Remove media 1','Cancel media edits','Save media']){const target=button(page,name);await target.scrollIntoViewIfNeeded();const rect=await target.boundingBox();assert(rect&&rect.x>=0&&rect.x+rect.width<=390.5,`${name} reachable within mobile viewport`);}
    await screenshot(page,'mobile-390-editor.png');
    const focusable=currentDialog(page).locator('button:not(:disabled):visible, textarea:not(:disabled):visible, input:not(:disabled):visible, a[href]:visible');await focusable.last().focus();await page.keyboard.press('Tab');assert.equal(await currentDialog(page).evaluate(element=>element.contains(document.activeElement)),true,'Tab remains in dialog');
    await save(page,state);await closePost(page);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');await openPost(page);await openEditor(page);await assertSelected(page,[2,1].map(assetId));
    state.assertions=['mobile dialog labels and body scroll lock','keyboard selection/reorder/Save','all edit actions horizontally reachable','focus remains contained','save and reopen preserve ordered carousel'];
  },{viewport:{width:390,height:844}});
}catch(error){launchError=error.stack||String(error);console.error(launchError);process.exitCode=1;}
finally{
  if(browser)await browser.close();
  const coverageLimits=[
    'Production WeeklyContentPersistent, PostMediaEditor, their imported helpers, monthly panel and production CSS are bundled. Only Next Link/navigation and Supabase browser transport are fixture adapters.',
    'All assets, captions, identities, API replies, CAS state and storage uploads are synthetic and intercepted. Any unlisted route or external origin fails the scenario; no live app, credentials, production media, database changes, approvals, schedules or publishing are used.',
    'This is real-component Chromium behavioral coverage, not real Supabase ownership/authentication, server transaction/database integration, or deployed Next App Router validation. Existing backend tests cover those contracts separately.',
    'The suite verifies browser controls and request payloads. It does not claim HEIC conversion, codec compatibility across devices, production storage recovery, or real-device safe-area/hardware testing.',
  ];
  const report={status:launchError?'blocked':results.some(result=>result.status==='failed')?'failed':'passed',generatedAt:new Date().toISOString(),...buildEvidence,executed:results.length,passed:results.filter(result=>result.status==='passed').length,results,screenshots,launchError,coverageLimits};
  await fs.writeFile(path.join(evidence,'post-media-browser-report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(evidence,'post-media-request-traces.json'),JSON.stringify(traces,null,2));await fs.writeFile(path.join(evidence,'post-media-summary.md'),`# Edit media browser regression\n\n${report.passed}/${report.executed} scenarios passed.\n\n${results.map(result=>`- ${result.status.toUpperCase()}: ${result.name}${result.error?' — '+result.error.split('\n')[0]:''}`).join('\n')}\n\n## Coverage limits\n${coverageLimits.map(value=>'- '+value).join('\n')}\n`);console.log(`POST_MEDIA_SUITE ${JSON.stringify({status:report.status,executed:report.executed,passed:report.passed,screenshots:screenshots.length})}`);
}
if(results.some(result=>result.status==='failed'))process.exitCode=1;
