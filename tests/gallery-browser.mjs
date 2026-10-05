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
assert(!globalSource.includes('--overview-grid-width'), 'Create preview widths must not depend on a viewport-height budget');
assert(!globalSource.includes('container:content-gallery'), 'overview must not establish a containing block for fixed overlays');
const sources = [
  'app/globals.css','app/(app)/dashboard/page.tsx','app/(app)/dashboard/weekly-content-persistent.tsx',
  'tests/gallery-browser.mjs','tests/fixtures/gallery-browser-entry.tsx',
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
for (const file of ['app/(app)/dashboard/page.tsx','tests/fixtures/gallery-browser-entry.tsx']) {
  assert(!(await fs.readFile(path.join(repo,file),'utf8')).includes('max-w-[1640px]'), `${file} must not cap the Create workspace`);
}
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
async function gallery(page, { columns=3,count=6,expectedWidth,maxWidth=1120,selector='.content-gallery-grid' }={}) {
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
  if(maxWidth!==null) assert(data.width<=maxWidth+.1,'shared Approved/Media/mobile gallery retains its width cap');
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
// Photo-led Create fills the available width; document scrolling reveals later rows.
// A card may be taller than a short viewport, so verify its top and bottom independently.
async function overviewLayout(page,withPanel=true) {
  const viewport=page.viewportSize();
  const data=await page.locator('.content-gallery-main').evaluate(main=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const workspace=main.parentElement,grid=main.querySelector('.editorial-grid');
    return {main:rect(main),workspace:rect(workspace),grid:rect(grid),workspaceGap:parseFloat(getComputedStyle(workspace).columnGap),
      mainMaxWidth:getComputedStyle(main).maxWidth,gridMaxWidth:getComputedStyle(grid).maxWidth,
      cards:[...grid.querySelectorAll(':scope > .editorial-plan-card')].map(card=>({...rect(card),contents:[...card.querySelectorAll(':scope > button,:scope > h2,:scope > p,button h2,button p')].map(rect)}))};
  });
  const {cards,main,workspace,grid}=data;
  assert.equal(cards.length,6,'six complete overview cards remain in the document');
  assert(Math.abs(grid.width-main.width)<1,'Create grid stretches to the full main column');
  for(const [index,card] of cards.entries()) {
    assert(card.x>=main.x-1&&card.right<=main.right+1,'cards fit the main column horizontally');
    assert(Math.abs(card.width-cards[0].width)<1,'all six card columns have equal widths');
    assert(Math.abs(card.y-cards[index<3?0:3].y)<1,'exactly three cards per row');
    assert(card.height>0,'every complete card participates in document layout');
    for(const content of card.contents) assert(content.x>=card.x-1&&content.right<=card.right+1,'card title, status and actions fit its width');
  }
  assert(cards[3].y>=cards[0].bottom,'second row follows the complete first row');
  assert(Math.abs(cards[0].x-cards[3].x)<1,'rows share a left edge');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no document horizontal overflow');
  if(viewport.width>=1024) {
    const contentWidth=viewport.width-64;
    assert(Math.abs(workspace.x-32)<1&&Math.abs(workspace.right-(viewport.width-32))<1,'desktop workspace uses 32px page gutters without a maximum-width cap');
    assert(Math.abs(workspace.width-contentWidth)<1,'desktop workspace uses all available content width');
    assert.equal(data.mainMaxWidth,'none','Create main has no shared gallery maximum-width cap');
    assert(Math.abs(main.x-workspace.x)<1,'Create begins at the workspace left edge');
    assert(Math.abs(main.width-(contentWidth-(withPanel?264:0)))<1,'Create fills all remaining width beside the optional 240px panel and 24px gap');
    const minimumShare=viewport.width>=1280?.72:.68;
    assert(main.width/contentWidth>=minimumShare,`Create occupies at least ${minimumShare*100}% of desktop content width`);
    if(withPanel) {
      const panelData=await panel(page).evaluate(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,position:style.position,top:parseFloat(style.top),overflowY:style.overflowY,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
      assert(Math.abs(data.workspaceGap-24)<1,'desktop columns retain a 24px gutter');
      assert(panelData.width<=240.1&&Math.abs(panelData.width-240)<1,'desktop monthly planner is a compact 240px column');
      assert(Math.abs(panelData.x-main.right-24)<1,'monthly plan sits immediately beside the main column');
      assert(Math.abs(panelData.right-workspace.right)<1,'monthly planner aligns to the content right edge');
      assert.equal(panelData.position,'sticky','desktop planner stays sticky during ordinary document scrolling');
      assert.equal(panelData.overflowY,'auto','planner has its own vertical scrolling');
      assert(panelData.scrollWidth<=panelData.clientWidth+1,'narrow planner has no horizontal overflow');
      assert(panelData.height<=viewport.height-panelData.top+1,'planner never exceeds its viewport height budget');
      data.panel=panelData;
    }
  }
  return {viewport,...data};
}
async function verifyDocumentReachability(page,name,{withPanel=false,capture=true}={}) {
  const viewport=page.viewportSize(),cards=page.locator('.editorial-grid > .editorial-plan-card');
  await page.evaluate(()=>window.scrollTo(0,0));
  const initialPanel=withPanel?await panel(page).boundingBox():null;
  const positions=[];
  for(let index=0;index<await cards.count();index++) {
    const bounds=await cards.nth(index).evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top+scrollY,bottom:r.bottom+scrollY};});
    for(const [edge,offset] of [['top',bounds.top-16],['bottom',bounds.bottom-viewport.height+16]]) {
      await page.evaluate(y=>window.scrollTo(0,Math.max(0,y)),offset);
      const visible=await cards.nth(index).boundingBox();
      const point=edge==='top'?visible.y:visible.y+visible.height;
      assert(point>=-1&&point<=viewport.height+1,`card ${index+1} ${edge} reachable through ordinary document scrolling`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'scrolling never introduces horizontal overflow');
      positions.push({card:index+1,edge,scrollY:await page.evaluate(()=>scrollY)});
    }
  }
  const secondRowY=await cards.nth(3).evaluate(el=>el.getBoundingClientRect().top+scrollY);
  await page.evaluate(y=>window.scrollTo(0,Math.max(0,y-16)),secondRowY);
  const bottomRowScrollY=await page.evaluate(()=>scrollY);
  if(viewport.width>=1024) assert(bottomRowScrollY>0,'the second row is reached through document scrolling');
  if(withPanel) {
    const sticky=await panel(page).boundingBox(),top=await panel(page).evaluate(el=>parseFloat(getComputedStyle(el).top));
    assert(sticky&&Math.abs(sticky.y-top)<1,'monthly planner remains pinned while the document scrolls to the second row');
    assert(Math.abs(sticky.x-initialPanel.x)<1&&Math.abs(sticky.width-initialPanel.width)<1,'document scrolling preserves planner alignment and width');
  }
  if(capture) await screenshot(page,`${name}-bottom-row-after-scroll.png`);
  await page.evaluate(()=>window.scrollTo(0,0));
  return {positions,bottomRowScrollY};
}
async function verifyPlannerControls(page) {
  // Put the sticky rail fully inside the viewport before exercising only its own scroll.
  await page.evaluate(()=>window.scrollTo(0,80));
  for(const control of [panel(page).getByLabel('Month',{exact:true}),panel(page).locator('[aria-label$="planning dates"]'),panel(page).getByRole('heading',{name:'Must feature',exact:true}),panel(page).locator('textarea'),panel(page).getByRole('button',{name:'+ Add priority',exact:true})]) {
    await control.evaluate(el=>{
      const rail=el.closest('#monthly-plan-panel'),box=el.getBoundingClientRect(),bounds=rail.getBoundingClientRect();
      const top=Math.max(bounds.top,0),bottom=Math.min(bounds.bottom,innerHeight);
      if(box.bottom>bottom) rail.scrollTop+=box.bottom-bottom+1;
      else if(box.top<top) rail.scrollTop+=box.top-top-1;
    });
    const box=await control.boundingBox(),rail=await panel(page).boundingBox();
    assert(box&&rail&&box.x>=rail.x-1&&box.x+box.width<=rail.x+rail.width+1,'calendar and priority controls fit the narrow planner without horizontal clipping');
    assert(box.y>=Math.max(rail.y,0)-1&&box.y+box.height<=Math.min(rail.y+rail.height,page.viewportSize().height)+1,'planner controls remain reachable in its own scroll area');
  }
  await panel(page).evaluate(el=>{el.scrollTop=0;});
  await page.evaluate(()=>window.scrollTo(0,0));
}
async function verifyMobileFocus(page) {
  assert.equal(await panel(page).getAttribute('aria-modal'),'true','mobile sheet identifies itself as modal');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','sheet locks background document scrolling');
  assert.equal(await panel(page).evaluate(el=>el.contains(document.activeElement)),true,'opening the mobile sheet moves focus inside');
  const focusTargets=panel(page).locator('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href]');
  await focusTargets.first().focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await focusTargets.last().evaluate(el=>document.activeElement===el),true,'Shift+Tab wraps inside the sheet');
  await page.keyboard.press('Tab');
  assert.equal(await focusTargets.first().evaluate(el=>document.activeElement===el),true,'Tab wraps inside the sheet');
  await page.keyboard.press('Escape');await panel(page).waitFor({state:'hidden'});
  await eventually(()=>toggle(page).evaluate(el=>document.activeElement===el),'closing the sheet restores trigger focus');
  assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),false,'closing the sheet restores background interaction');
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','closing the sheet restores document scrolling');
  await openPanel(page);
}
async function verifyBreakpointResize(page) {
  const height=page.viewportSize().height,input=panel(page).locator('textarea'),draft='Unsaved priority survives the desktop breakpoint';
  await input.fill(draft);
  await page.setViewportSize({width:1023,height});
  await panel(page).waitFor({state:'hidden'});
  assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),false,'1023px starts with a closed sheet and interactive content');
  await openPanel(page);
  assert.equal(await panel(page).getAttribute('role'),'dialog','1023px uses the mobile sheet');
  assert.equal(await input.inputValue(),draft,'desktop-to-sheet resize preserves priority input');
  assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),true,'1023px sheet makes background inert');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','1023px sheet locks document scrolling');
  assert.equal(await panel(page).evaluate(el=>el.contains(document.activeElement)),true,'1023px sheet receives focus');
  await page.setViewportSize({width:1024,height});
  await eventually(()=>panel(page).getAttribute('role').then(value=>value==='complementary'),'1024px restores desktop planner');
  assert.equal(await input.inputValue(),draft,'sheet-to-desktop resize preserves priority input');
  assert.equal(await panel(page).isVisible(),true,'1024px desktop planner stays open');
  assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),false,'1024px restores main interaction');
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','1024px releases sheet scroll lock');
  await eventually(()=>toggle(page).evaluate(el=>document.activeElement===el),'leaving modal mode restores trigger focus');
  await overviewLayout(page,true);
  await panel(page).getByRole('button',{name:'Cancel',exact:true}).click();
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
      if(width>=1024) {
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
    if(hasMonthlyPanel) await eventually(()=>toggle(page).getAttribute('aria-expanded').then(value=>value===(width>=1024?'true':'false')),'responsive panel initialized');
    else assert.equal(await toggle(page).count(),0,'main candidate has no monthly feature');
    if(width>=1024&&hasMonthlyPanel) {
      await eventually(()=>panel(page).locator('textarea').isEnabled(),'desktop monthly plan ready');
      measurements.initialOverview=await overviewLayout(page);
      await screenshot(page,`${name}-create-open-top.png`);
      measurements.openDocumentScroll=await verifyDocumentReachability(page,`${name}-create-open`,{withPanel:true});
    }
    await closePanel(page);
    const fullWidth=Math.min(1120,width-(width<768?32:64));
    const createWidth=width>=1024?width-64:fullWidth;
    const openCreateWidth=width>=1024&&hasMonthlyPanel?createWidth-264:createWidth;
    measurements.createCollapsed=await gallery(page,{expectedWidth:createWidth,maxWidth:width>=1024?null:1120});
    measurements.collapsedOverview=await overviewLayout(page,false);
    const orderBefore=await page.locator('.editorial-card-media > img,.editorial-card-media > video').evaluateAll(els=>els.map(el=>el.getAttribute('src')));
    await screenshot(page,`${name}-create-collapsed-top.png`);
    measurements.collapsedDocumentScroll=await verifyDocumentReachability(page,`${name}-create-collapsed`,{capture:width>=1024});
    if(hasMonthlyPanel) {
    await openPanel(page);
    measurements.createOpen=await gallery(page,{columns:3,expectedWidth:openCreateWidth,maxWidth:width>=1024?null:1120});
    assert.equal(await panel(page).getAttribute('role'),width>=1024?'complementary':'dialog');
    assert.equal(await page.locator('.content-gallery-main').evaluate(el=>el.hasAttribute('inert')),width<1024);
    await screenshot(page,`${name}-create-panel-open.png`);
    if(width<1024) await verifyMobileFocus(page);
    if(width>=1024) {
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
      await page.evaluate(()=>window.scrollTo(0,0));
      await verifyPlannerControls(page);
      measurements.longNotesOverview=await overviewLayout(page);
      await panel(page).getByLabel('Month',{exact:true}).fill('2026-08');
      await eventually(()=>panel(page).locator('[aria-label="August 2026 planning dates"] button').count().then(count=>count===42),'six-week calendar displayed');
      await eventually(()=>panel(page).locator('textarea').isEnabled(),'six-week month and long priorities loaded');
      await verifyPlannerControls(page);
      measurements.sixWeekOverview=await overviewLayout(page);
      await screenshot(page,`${name}-six-week-calendar.png`);
      await panel(page).getByLabel('Month',{exact:true}).fill('2026-10');
      await eventually(()=>panel(page).locator('textarea').isEnabled(),'October priorities reloaded');
      if(width===1024) await verifyBreakpointResize(page);
    }
    await closePanel(page);await openPanel(page);await closePanel(page);
    assert.deepEqual(await page.locator('.editorial-card-media > img,.editorial-card-media > video').evaluateAll(els=>els.map(el=>el.getAttribute('src'))),orderBefore,'repeat panel toggles preserve selection and order');
    measurements.createRestored=await gallery(page,{expectedWidth:createWidth,maxWidth:width>=1024?null:1120});
    }
    if(width>=1024) {
      await page.getByRole('button',{name:'+ New post',exact:true}).click();
      await page.getByRole('textbox',{name:'New post caption',exact:true}).fill('Unsaved composer fixture');
      assert.equal(await page.locator('.editorial-plan-card').count(),6,'composer does not remove overview cards');
      measurements.composerDocumentScroll=await verifyDocumentReachability(page,`${name}-composer`,{capture:false});
      await page.getByRole('button',{name:'Close composer',exact:true}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      await overviewLayout(page,false);
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
      if(width<1024)assert(Math.abs(measurements.media.tiles[0].width-measurements.createCollapsed.tiles[0].width)<1,'mobile/tablet retain shared thumbnail widths');
    }
    assert.deepEqual(unexpected,[],'all network explicitly fulfilled at fake origin, without writes');
    assert.deepEqual(errors,[],'no uncaught component errors');
    results.push({name,status:'passed',measurements});console.log(`PASS ${name}`);
  } catch(error) {
    results.push({name,status:'failed',error:error.stack,measurements});console.error(`FAIL ${name}: ${error.message}`);
    try {await screenshot(page,`${name}-FAIL.png`);} catch {}
  } finally {traces.push({scenario:name,requests,unexpected,errors});await context.close();}
}
const viewportCases=[[390,1000],[768,1000],[1023,768],[1024,768],[1180,800],[1280,600],[1280,720],[1440,900],[2048,1055]];
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
    'Screenshots cover 390×1000, 768×1000, 1023×768, 1024×768, 1180×800, 1280×600, 1280×720, 1440×900 and 2048×1055, including desktop top and bottom-row document-scroll views. Assertions cover width-led Create geometry, six cards in two rows with equal 3:4 previews, a 240px sticky independently scrolling planner, long saved notes, six-week calendars, mobile focus/inert behavior, and 1023↔1024 resize with an unsaved buffer. All six cards need not fit above the fold. Real-device keyboard and safe-area hardware are outside this fixture.',
  ];
  const report={status:launchError?'blocked':results.some(result=>result.status==='failed')?'failed':'passed',generatedAt:new Date().toISOString(),...buildEvidence,plannedScenarios:planned,executed:results.length,results,screenshots,launchError,coverageLimits};
  await fs.writeFile(path.join(evidence,'gallery-browser-report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(evidence,'gallery-request-traces.json'),JSON.stringify(traces,null,2));
  await fs.writeFile(path.join(evidence,'gallery-summary.md'),`# Gallery browser regression\n\n${launchError?'BLOCKED: browser launch failed; '+results.length+' scenarios executed.':results.filter(r=>r.status==='passed').length+'/'+results.length+' scenarios passed.'}\n\n${results.map(r=>'- '+r.status.toUpperCase()+': '+r.name+(r.error?' — '+r.error.split('\n')[0]:'')).join('\n')}\n\n## Limits\n${coverageLimits.map(value=>'- '+value).join('\n')}\n`);
  console.log(`GALLERY_SUITE ${JSON.stringify({status:report.status,planned:planned.length,executed:results.length,passed:results.filter(result=>result.status==='passed').length,screenshots:screenshots.length})}`);
}
if(results.some(result=>result.status==='failed'))process.exitCode=1;
