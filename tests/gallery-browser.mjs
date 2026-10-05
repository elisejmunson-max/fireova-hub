/**
 * Real-component, fake-data gallery regression. No live requests or local server.
 * Run: node tests/gallery-browser.mjs (after npx playwright install --with-deps chromium)
 * Compile/static checks only: node tests/gallery-browser.mjs --build-only
 * Optional: CHROMIUM_PATH=/usr/bin/chromium GALLERY_EVIDENCE_DIR=/artifact/path
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { ORIGIN, gallerySeed, gallerySvg, makePlan, originalUrl } from './fixtures/gallery-data.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repo, 'tests/fixtures');
const evidence = path.resolve(process.env.GALLERY_EVIDENCE_DIR || path.join(repo, '../evidence/gallery'));
await fs.mkdir(evidence, { recursive:true });
const hasMonthlyPanel = (await fs.readFile(path.join(repo,'app/(app)/dashboard/weekly-content-persistent.tsx'),'utf8')).includes('import MonthlyPlanningPanel');
const globalSource = await fs.readFile(path.join(repo,'app/globals.css'),'utf8');
assert(!globalSource.includes('repeat(2,minmax(0,1fr))'), 'Create overview must retain three columns with its panel open');
assert(globalSource.includes('--overview-grid-width:calc(112.5dvh - 368.5px)'), 'desktop preview sizes must use the viewport height budget');
assert(!globalSource.includes('container:content-gallery'), 'overview must not establish a containing block for fixed overlays');
const sources = [
  'app/globals.css','app/(app)/dashboard/page.tsx','app/(app)/dashboard/weekly-content-persistent.tsx',
  ...(hasMonthlyPanel?['app/(app)/dashboard/monthly-planning.module.css','app/(app)/dashboard/monthly-planning-panel.tsx']:[]),
  'app/(app)/approved-posts/page.tsx','app/(app)/approved-posts/approved-posts-grid.tsx',
  'app/(app)/media-bank/page.tsx','app/(app)/media-bank/library.tsx',
  'components/layout/app-chrome.tsx','components/layout/editorial-loading.tsx',
];
const sourceSha256 = {};
for (const file of sources) sourceSha256[file] = createHash('sha256').update(await fs.readFile(path.join(repo,file))).digest('hex');
// The server pages supply data rather than rendering in the browser fixture. Guard their layout contracts.
for (const [file, marker] of [
  ['app/(app)/dashboard/page.tsx','page-content editorial-create-page py-4 sm:py-8'],
  ['app/(app)/approved-posts/page.tsx','editorial-approved editorial-shell content-gallery-shell'],
  ['app/(app)/media-bank/page.tsx','editorial-media-bank editorial-shell content-gallery-shell'],
]) assert((await fs.readFile(path.join(repo,file),'utf8')).includes(marker), `${file} must match fixture page wrapper`);
const bundled = await build({
  entryPoints:[path.join(fixture,'gallery-browser-entry.tsx')],outdir:path.join(evidence,'bundle'),
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fake-only-platform-adapters',setup(builder) {
    builder.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:path.join(fixture,'gallery-supabase.ts')}));
    builder.onResolve({filter:/^next\/link$/},()=>({path:path.join(fixture,'gallery-link.tsx')}));
    builder.onResolve({filter:/^next\/navigation$/},()=>({path:path.join(fixture,'gallery-navigation.ts')}));
  }}],
});
const js = Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.js')).contents);
const moduleCss = Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.contents || '');
const postcss=require('postcss'),tailwind=require('tailwindcss'),loadConfig=require('tailwindcss/loadConfig');
const globals = (await postcss([tailwind({...loadConfig(path.join(repo,'tailwind.config.ts')),content:[path.join(repo,'app/**/*.{js,ts,jsx,tsx,mdx}'),path.join(repo,'components/**/*.{js,ts,jsx,tsx,mdx}'),path.join(fixture,'gallery-browser-entry.tsx')]})]).process(await fs.readFile(path.join(repo,'app/globals.css'),'utf8'),{from:path.join(repo,'app/globals.css')})).css;
const css = Buffer.concat([Buffer.from(globals),Buffer.from('\n'),moduleCss]);
const video = await fs.readFile(path.join(fixture,'media-bank-video.mp4'));
const buildEvidence = { sourceSha256,bundleSha256:createHash('sha256').update(js).digest('hex'),bundleBytes:js.length,cssBytes:css.length,actualComponentsBundled:true,actualTailwindCompiled:true,hasMonthlyPanel };
await fs.writeFile(path.join(evidence,'gallery-static-build-report.json'),JSON.stringify({status:'passed',...buildEvidence,browserScenariosExecuted:0},null,2));
if (process.argv.includes('--build-only')) { console.log('PASS real Create/Approved/Media/Loading/AppChrome components and production CSS compiled; wrapper contracts verified. Browser not run.'); process.exit(0); }

const results=[],screenshots=[],traces=[];
let browser,launchError;
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check,message) {
  const deadline=Date.now()+7000;let last;
  while(Date.now()<deadline) { try {if(await check())return;} catch(error){last=error;} await sleep(40); }
  throw new Error(`${message}${last?`: ${last.message}`:''}`);
}
async function screenshot(page,name) {
  await page.screenshot({path:path.join(evidence,name),fullPage:false});screenshots.push(name);
}
async function gallery(page, { columns=3,count=6,expectedWidth,selector='.content-gallery-grid' }={}) {
  const grid = page.locator(selector).first();await grid.waitFor();
  const tiles = grid.locator('.content-gallery-tile');
  assert.equal(await tiles.count(),count);
  const data = await grid.evaluate(el=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};
    return { ...rect(el),columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,gap:parseFloat(getComputedStyle(el).columnGap),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
      tiles:[...el.querySelectorAll('.content-gallery-tile')].map(tile=>({...rect(tile),media:[...tile.querySelectorAll(':scope > img,:scope > video')].map(media=>({fit:getComputedStyle(media).objectFit,border:getComputedStyle(media).borderWidth,src:media.getAttribute('src')}))})) };
  });
  assert.equal(data.columns,columns,'expected shared column count');
  assert.equal(data.gap,page.viewportSize().width<768?8:16,'shared responsive gutter');
  assert(data.width<=1120.1,'gallery never exceeds 1120px');
  if(expectedWidth!==undefined) assert(Math.abs(data.width-expectedWidth)<1,'shared content gallery width');
  assert(data.scrollWidth<=data.clientWidth+1,'no clipped grid overflow');
  for(const tile of data.tiles) {
    assert(Math.abs(tile.width/tile.height-.75)<.002,`3:4 tile, got ${tile.width}x${tile.height}`);
    assert(tile.x>=0&&tile.right<=page.viewportSize().width+1,'tile stays inside viewport');
    assert(Math.abs(tile.width-data.tiles[0].width)<1,'all tile widths equal');
    for(const media of tile.media) {assert.equal(media.fit,'cover');assert.equal(media.border,'0px','no black inset image border');}
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no document overflow');
  const main=page.locator('.content-gallery-main');
  if(await main.count()) assert.equal(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Create content is not clipped by app chrome');
  return data;
}
const panel=page=>page.locator('#monthly-plan-panel');
const toggle=page=>page.getByRole('button',{name:'Monthly plan',exact:true});
async function closePanel(page) {
  if(await panel(page).isVisible()) {await panel(page).getByRole('button',{name:'Close monthly plan',exact:true}).click();await panel(page).waitFor({state:'hidden'});}
}
async function openPanel(page) {
  await toggle(page).click();await panel(page).waitFor();await eventually(()=>panel(page).locator('textarea').isEnabled(),'monthly plan ready');
}
async function navigateTab(page,name) {
  if(page.viewportSize().width<768) await page.getByRole('button',{name:'☰',exact:true}).click();
  await Promise.all([page.waitForEvent('load'),page.getByRole('link',{name,exact:true}).click()]);
}
async function verifyDetailFit(page,selector,expectedSource) {
  const media=page.locator(selector).first();await media.waitFor();
  assert.equal(await media.evaluate(el=>getComputedStyle(el).objectFit),'contain');
  assert.equal(await media.getAttribute('src'),expectedSource,'original media selection unchanged');
}
async function overviewFits(page,withPanel=true) {
  const viewport=page.viewportSize();
  assert.equal(await page.evaluate(()=>window.scrollY),0,'overview and collection interactions do not require page scrolling');
  const inside=(box,label)=>assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,`${label} fully inside ${viewport.width}×${viewport.height}: ${JSON.stringify(box)}`);
  const cards=await page.locator('.editorial-grid > .editorial-plan-card').evaluateAll(els=>els.slice(0,6).map(el=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {...rect(el),contents:[...el.querySelectorAll(':scope > button,:scope > h2,:scope > p,button h2,button p')].map(rect)};
  }));
  assert.equal(cards.length,6,'six complete overview cards');
  for(const [index,card] of cards.entries()) {
    inside(card,`card ${index+1}`);
    for(const content of card.contents)inside(content,`card ${index+1} title, status or action`);
    assert(Math.abs(card.y-cards[index<3?0:3].y)<1,'exactly three cards per row');
  }
  assert(cards[3].y>cards[0].y,'second row follows first');
  assert(Math.abs(cards[0].x-cards[3].x)<1,'rows share a left edge');
  for(const selector of ['#review-title','.editorial-overview-heading .btn-secondary','.editorial-toolbar']) {
    for(const element of await page.locator(selector).all())inside(await element.boundingBox(),selector);
  }
  if(withPanel) {
    const panelBox=await panel(page).boundingBox();inside(panelBox,'monthly panel');
    assert(panelBox.x>cards[2].x+cards[2].width,'monthly plan beside the cards');
    for(const element of [panel(page).locator('[aria-label$="planning dates"]'),panel(page).getByRole('heading',{name:'Must feature',exact:true}),panel(page).locator('textarea'),panel(page).getByRole('button',{name:'+ Add priority',exact:true})]) {
      const box=await element.boundingBox();inside(box,'monthly calendar or priority control');
      assert(box.x>=panelBox.x+1&&box.y>=panelBox.y+1&&box.x+box.width<=panelBox.x+panelBox.width-1&&box.y+box.height<=panelBox.y+panelBox.height-1,'calendar and priority controls stay inside the panel');
    }
  }
  return {viewport,cards,panel:withPanel?await panel(page).boundingBox():null};
}
async function scenario(width,placeholders=false,height=1000) {
  const name=`gallery-${width}x${height}${placeholders?'-planning-slots':''}`;
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  context.setDefaultTimeout(7000);
  const seed=gallerySeed({placeholders}),requests=[],unexpected=[],errors=[],measurements={};
  const respond=(route,body,type='application/json')=>route.fulfill({status:200,contentType:type,headers:{'Cache-Control':'no-store'},body:Buffer.isBuffer(body)?body:typeof body==='string'?body:JSON.stringify(body)});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());requests.push({url:request.url(),method:request.method()});
    if(url.origin!==ORIGIN||request.method()!=='GET') {unexpected.push(request.url());return route.abort('blockedbyclient');}
    if(['/dashboard','/approved-posts','/media-bank'].includes(url.pathname)) return respond(route,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.__GALLERY_FIXTURE__=${JSON.stringify(seed).replaceAll('<','\\u003c')}</script><script src="/app.js"></script></body></html>`,'text/html');
    if(url.pathname==='/app.js') return respond(route,js,'text/javascript');
    if(url.pathname==='/app.css') return respond(route,css,'text/css');
    if(url.pathname==='/favicon.ico') return route.fulfill({status:204,body:''});
    if(url.pathname==='/api/monthly-plan') {
      const month=url.searchParams.get('month'),plan=makePlan(month);
      if(width>=1200) {
        plan.features.priorities=Array.from({length:12},(_,index)=>({id:`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,text:index===0?'Autumn menu launch':`Priority ${index+1}: ${'Long saved menu and event details. '.repeat(24)}`}));
        plan.entries.push(...Array.from({length:30},(_,index)=>({id:`extra-${index}`,postId:`extra-${index}`,date:`${month}-01`,title:`Additional plan entry ${index+1}`,status:'Draft'})));
      }
      return respond(route,plan);
    }
    if(url.pathname==='/api/media-bank/library') {
      const filter=url.searchParams.get('filter')||'all';
      const items=seed.media.initialAssets.filter(asset=>filter==='all'||asset.file_type.startsWith(filter==='photo'?'image/':'video/'));
      return respond(route,{items,total:items.length,counts:seed.media.initialCounts,hasMore:false,nextOffset:items.length});
    }
    if(url.pathname.startsWith('/api/media-bank/thumbnail/')) {
      const id=decodeURIComponent(url.pathname.split('/').at(-1));
      if(seed.media.initialAssets.some(asset=>asset.id===id)) return respond(route,gallerySvg(Number(id.split('-').at(-1))),'image/svg+xml');
    }
    if(url.pathname.startsWith('/fixture-media/')) {
      const storage=decodeURIComponent(url.pathname.slice('/fixture-media/'.length));
      const asset=seed.media.initialAssets.find(asset=>asset.storage_path===storage);
      if(asset) return respond(route,asset.file_type.startsWith('video/')?video:gallerySvg(Number(asset.id.split('-').at(-1))),asset.file_type.startsWith('video/')?'video/mp4':'image/svg+xml');
    }
    unexpected.push(request.url());return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(`${ORIGIN}/dashboard`);await page.getByRole('heading',{name:'Your next two weeks'}).waitFor();
    if(hasMonthlyPanel) await eventually(()=>toggle(page).getAttribute('aria-expanded').then(value=>value===(width>=1200?'true':'false')),'responsive panel initialized');
    else assert.equal(await toggle(page).count(),0,'main candidate has no monthly feature');
    if(width>=1200&&hasMonthlyPanel) {
      await eventually(()=>panel(page).locator('textarea').isEnabled(),'desktop monthly plan ready');
      measurements.initialOverview=await overviewFits(page);
      await screenshot(page,`${name}-six-post-overview.png`);
    }
    await closePanel(page);
    const fullWidth=Math.min(1120,width-(width<768?32:64));
    const createWidth=width>=1200?Math.min(fullWidth,1.125*height-368.5):fullWidth;
    measurements.createCollapsed=await gallery(page,{expectedWidth:createWidth});
    if(width>=1200) measurements.collapsedOverview=await overviewFits(page,false);
    const orderBefore=await page.locator('.editorial-card-media > img,.editorial-card-media > video').evaluateAll(els=>els.map(el=>el.getAttribute('src')));
    await screenshot(page,`${name}-create-collapsed.png`);
    if(hasMonthlyPanel) {
    await openPanel(page);
    measurements.createOpen=await gallery(page,{columns:3,expectedWidth:createWidth});
    assert.equal(await panel(page).getAttribute('role'),width>=1200?'complementary':'dialog');
    assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),width<1200);
    await screenshot(page,`${name}-create-panel-open.png`);
    if(width>=1200) {
      const priorities=panel(page).locator('section > ul');
      const planList=panel(page).locator('ol').locator('..');
      const firstActions=await priorities.locator('li').first().locator('div').boundingBox(),priorityBounds=await priorities.boundingBox();
      assert(firstActions&&priorityBounds&&firstActions.y+firstActions.height<=priorityBounds.y+priorityBounds.height+1,'one short priority and its Edit/Remove controls fit in the scroller');
      for(const collection of [priorities,planList]) {
        assert.equal(await collection.evaluate(el=>getComputedStyle(el).overflowY),'auto','long collections scroll independently');
        assert.equal(await collection.evaluate(el=>el.scrollHeight>el.clientHeight),true,'fixture exercises a long scrolling collection');
        await collection.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        assert.equal(await collection.evaluate(el=>el.scrollTop>0),true,'collection can scroll to its final item');
      }
      await priorities.getByRole('button',{name:/^Edit priority:/}).last().focus();
      assert.equal(await priorities.getByRole('button',{name:/^Edit priority:/}).last().evaluate(el=>document.activeElement===el),true,'long-list controls remain keyboard reachable');
      measurements.longNotesOverview=await overviewFits(page);
      await panel(page).getByLabel('Month',{exact:true}).fill('2026-08');
      await eventually(()=>panel(page).locator('[aria-label="August 2026 planning dates"] button').count().then(count=>count===42),'six-week calendar displayed');
      await eventually(()=>panel(page).locator('textarea').isEnabled(),'six-week month and long priorities loaded');
      measurements.sixWeekOverview=await overviewFits(page);
      await screenshot(page,`${name}-six-week-calendar.png`);
      await panel(page).getByLabel('Month',{exact:true}).fill('2026-10');
    }
    await closePanel(page);await openPanel(page);await closePanel(page);
    assert.deepEqual(await page.locator('.editorial-card-media > img,.editorial-card-media > video').evaluateAll(els=>els.map(el=>el.getAttribute('src'))),orderBefore,'repeat panel toggles preserve selection and order');
    measurements.createRestored=await gallery(page,{expectedWidth:createWidth});
    }
    if(width>=1200) {
      await page.getByRole('button',{name:'+ New post',exact:true}).click();
      await page.getByRole('textbox',{name:'New post caption',exact:true}).fill('Unsaved composer fixture');
      assert.equal(await page.locator('.editorial-plan-card').count(),6,'composer does not remove overview cards');
      await page.locator('.editorial-plan-card').last().scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.editorial-plan-card').last().isVisible(),true,'composer flow leaves the last card reachable');
      await page.getByRole('button',{name:'Close composer',exact:true}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      await overviewFits(page,false);
      await page.getByRole('button',{name:'+ New post',exact:true}).click();
      assert.equal(await page.getByRole('textbox',{name:'New post caption',exact:true}).inputValue(),'Unsaved composer fixture','layout changes preserve composer state');
      await page.getByRole('button',{name:'Close composer',exact:true}).click();
    }
    if(placeholders) {
      assert.equal(await page.locator('.editorial-planned-slot').count(),4,'covered and open slots use the same geometry');
    } else {
      await page.locator('.editorial-card-media').first().click();
      const detail=page.getByRole('dialog',{name:'A season at the table',exact:true});await detail.waitFor();
      const overlay=await detail.locator('..').boundingBox();
      assert(overlay&&Math.abs(overlay.x)<1&&Math.abs(overlay.y)<1&&Math.abs(overlay.width-width)<1&&Math.abs(overlay.height-height)<1,'post detail remains fixed to the viewport');
      await verifyDetailFit(page,'[role="dialog"] img.object-contain',originalUrl(seed.dashboard.initialAssets[0]));
      await page.getByRole('button',{name:'Next media',exact:true}).click();
      await verifyDetailFit(page,'[role="dialog"] img.object-contain',originalUrl(seed.dashboard.initialAssets[1]));
      await screenshot(page,`${name}-create-detail.png`);
      await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});
      await navigateTab(page,'Approved Posts');
      measurements.approved=await gallery(page,{expectedWidth:fullWidth});
      await screenshot(page,`${name}-approved.png`);
      assert.deepEqual(await page.locator('.content-gallery-grid > button > img,.content-gallery-grid > button > video').evaluateAll(els=>els.map(el=>el.getAttribute('src'))),seed.approved.map(post=>post.media[0].url));
      await page.locator('.content-gallery-grid > button').first().click();
      await verifyDetailFit(page,'img.object-contain',seed.approved[0].media[0].url);
      await page.getByRole('button',{name:'Next photo',exact:true}).click();
      await verifyDetailFit(page,'img.object-contain',seed.approved[0].media[1].url);
      await screenshot(page,`${name}-approved-detail.png`);
      await page.getByRole('button',{name:'Close post',exact:true}).click();
      await navigateTab(page,'Media Bank');
      measurements.media=await gallery(page,{count:8,expectedWidth:fullWidth});
      await screenshot(page,`${name}-media.png`);
      assert.equal(await page.locator('[data-media-id] video').count(),0,'Media Bank video previews remain lightweight');
      await page.locator('[data-media-id="asset-1"]').click();
      await verifyDetailFit(page,'img.object-contain',originalUrl(seed.media.initialAssets[0]));
      await screenshot(page,`${name}-media-detail.png`);
      await page.getByRole('button',{name:'Close media details',exact:true}).click();
      await navigateTab(page,'Create Content');await closePanel(page);
      assert.deepEqual(await page.locator('.editorial-card-media > img,.editorial-card-media > video').evaluateAll(els=>els.map(el=>el.getAttribute('src'))),orderBefore,'tab navigation never rewrites media or crops');
      for(const route of ['/dashboard','/approved-posts','/media-bank']) {
        await page.goto(`${ORIGIN}${route}?loading=1`);
        const loading=await gallery(page,{expectedWidth:fullWidth});
        assert(Math.abs(loading.tiles[0].width-measurements.media.tiles[0].width)<1,'loading tile matches real gallery');
      }
      await screenshot(page,`${name}-loading.png`);
      assert(Math.abs(measurements.approved.tiles[0].width-measurements.media.tiles[0].width)<1,'Approved and Media retain shared thumbnail widths');
      if(width<1200)assert(Math.abs(measurements.media.tiles[0].width-measurements.createCollapsed.tiles[0].width)<1,'mobile/tablet retain shared thumbnail widths');
    }
    assert.deepEqual(unexpected,[],'all network explicitly fulfilled at fake origin, without writes');
    assert.deepEqual(errors,[],'no uncaught component errors');
    results.push({name,status:'passed',measurements});console.log(`PASS ${name}`);
  } catch(error) {
    results.push({name,status:'failed',error:error.stack,measurements});console.error(`FAIL ${name}: ${error.message}`);
    try {await screenshot(page,`${name}-FAIL.png`);} catch {}
  } finally {traces.push({scenario:name,requests,unexpected,errors});await context.close();}
}
const viewportCases=[[390,1000],[768,1000],[1280,720],[1440,900],[2048,1055]];
const planned=[...viewportCases.map(([width,height])=>`gallery-${width}x${height}`),'gallery-390x1000-planning-slots','gallery-1280x720-planning-slots'];
try {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const [width,height] of viewportCases) await scenario(width,false,height);
  await scenario(390,true);await scenario(1280,true,720);
} catch(error) {launchError=error.stack||String(error);console.error(launchError);process.exitCode=1;}
finally {
  if(browser) await browser.close();
  const coverageLimits=[
    'Production Create, Approved, MediaLibrary, loading, AppChrome, Sidebar and EditorialNav are bundled with actual global CSS. Monthly panel and its CSS are included and tested only when imported by the real dashboard source; main has no monthly feature or panel checks.',
    'Server page wrappers are mirrored and guarded by source assertions. Server rendering, App Router internals, authentication, production data loading and deployed rendering require separate integration checks.',
    'All content is fictional with generated mixed-aspect SVG media and a tiny fixture MP4. No external requests, credentials, production media or state-changing requests are allowed.',
    'The suite verifies CSS crop behavior and source selection/order. It does not process or write original image files, and does not establish Instagram publishing behavior.',
    'Screenshots cover mobile/tablet and exact desktop viewports 1280×720, 1440×900 and 2048×1055. Desktop assertions include six complete cards in two rows, 3:4 previews, calendar and priority controls without page scrolling, long saved notes and a six-week month. Real-device keyboard and safe-area hardware are outside this fixture.',
  ];
  const report={status:launchError?'blocked':results.some(result=>result.status==='failed')?'failed':'passed',generatedAt:new Date().toISOString(),...buildEvidence,plannedScenarios:planned,executed:results.length,results,screenshots,launchError,coverageLimits};
  await fs.writeFile(path.join(evidence,'gallery-browser-report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(evidence,'gallery-request-traces.json'),JSON.stringify(traces,null,2));
  await fs.writeFile(path.join(evidence,'gallery-summary.md'),`# Gallery browser regression\n\n${launchError?'BLOCKED: browser launch failed; '+results.length+' scenarios executed.':results.filter(r=>r.status==='passed').length+'/'+results.length+' scenarios passed.'}\n\n${results.map(r=>'- '+r.status.toUpperCase()+': '+r.name+(r.error?' — '+r.error.split('\n')[0]:'')).join('\n')}\n\n## Limits\n${coverageLimits.map(value=>'- '+value).join('\n')}\n`);
  console.log(`GALLERY_SUITE ${JSON.stringify({status:report.status,planned:planned.length,executed:results.length,passed:results.filter(result=>result.status==='passed').length,screenshots:screenshots.length})}`);
}
if(results.some(result=>result.status==='failed'))process.exitCode=1;
