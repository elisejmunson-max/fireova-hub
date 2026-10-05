/**
 * Real-component monthly planning browser regressions. No application auth bypass,
 * server, credentials, live backend, or production network. Everything is fulfilled
 * or aborted at one fake HTTPS origin by the Playwright context-wide route.
 *
 * Run: CHROMIUM_PATH=/usr/bin/chromium node tests/monthly-planning-browser.mjs
 * Build only: node tests/monthly-planning-browser.mjs --build-only
 * Optional: MONTHLY_EVIDENCE_DIR=/artifact/path MONTHLY_TEST_FILTER=substring
 *
 * The real dashboard, monthly panel, helper modules, global Tailwind and CSS module
 * are bundled unchanged. Only next/link and the storage URL client are fixture adapters.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { ORIGIN, MONTH, clone, dashboardProps, expectedMedia, makePlan, mediaSvg, priorityId } from './fixtures/monthly-data.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repo, 'tests/fixtures');
const evidence = process.env.MONTHLY_EVIDENCE_DIR ? path.resolve(process.env.MONTHLY_EVIDENCE_DIR) : path.resolve(repo, '../evidence');
await fs.mkdir(evidence, { recursive:true });
const bundled = await build({
  entryPoints:[path.join(fixture,'monthly-browser-entry.tsx')], outdir:path.join(evidence,'fixture-bundle'),
  bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'test-only-adapters',setup(builder) {
    builder.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:path.join(fixture,'monthly-supabase.ts')}));
    builder.onResolve({filter:/^next\/link$/},()=>({path:path.join(fixture,'monthly-link.tsx')}));
  }}],
});
const js = Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.js')).contents);
const moduleCss = Buffer.from(bundled.outputFiles.find(file=>file.path.endsWith('.css')).contents);
const postcss=require('postcss'), tailwind=require('tailwindcss'), loadConfig=require('tailwindcss/loadConfig');
const globals = (await postcss([tailwind({...loadConfig(path.join(repo,'tailwind.config.ts')),content:[path.join(repo,'app/**/*.{js,ts,jsx,tsx,mdx}'),path.join(fixture,'monthly-browser-entry.tsx')]})]).process(await fs.readFile(path.join(repo,'app/globals.css'),'utf8'),{from:path.join(repo,'app/globals.css')})).css;
const css = Buffer.concat([Buffer.from(globals),Buffer.from('\n'),moduleCss]);
const hashes = {};
for (const file of ['app/(app)/dashboard/monthly-planning-panel.tsx','app/(app)/dashboard/monthly-planning.module.css','app/(app)/dashboard/weekly-content-persistent.tsx','lib/monthly-planning.ts','lib/manual-content-drafts.ts','app/globals.css']) hashes[file]=createHash('sha256').update(await fs.readFile(path.join(repo,file))).digest('hex');
const buildEvidence = {sourceSha256:hashes,bundleSha256:createHash('sha256').update(js).digest('hex'),bundleBytes:js.length,cssBytes:css.length,actualDashboardBundled:true,actualPanelBundled:true,actualCssModuleBundled:true,actualTailwindCompiled:true};
await fs.writeFile(path.join(evidence,'monthly-browser-static-build-report.json'),JSON.stringify({status:'passed',generatedAt:new Date().toISOString(),...buildEvidence,browserScenariosExecuted:0},null,2));
if (process.argv.includes('--build-only')) { console.log('PASS actual dashboard, panel, CSS module and Tailwind fixture bundle; browser scenarios not executed.'); process.exit(0); }

const results=[], traces=[], screenshots=[], planned=[];
let browser, launchError;
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const panel = page=>page.locator('#monthly-plan-panel');
const input = page=>panel(page).locator('textarea');
const button = (page,name)=>panel(page).getByRole('button',{name,exact:typeof name==='string'});
const toggle = page=>page.getByRole('button',{name:'Monthly plan',exact:true});
const add = page=>button(page,'+ Add priority');
const status = (page,text)=>panel(page).getByRole('status').filter({hasText:new RegExp(`^${text}$`)});
const cards = page=>page.locator('.editorial-grid > article');
const check = (state,description)=>state.assertions.push(description);
const deferred = ()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function eventually(fn,message,timeout=7000) { const until=Date.now()+timeout;let last;while(Date.now()<until) {try {if(await fn())return;} catch(error){last=error;}await sleep(35);}throw new Error(`${message}${last?`: ${last.message}`:''}`); }
async function screenshot(page,filename) {await page.screenshot({path:path.join(evidence,filename),fullPage:false});screenshots.push(filename);}
async function ready(page) {await panel(page).waitFor({state:'visible'});await eventually(()=>input(page).isEnabled(),'monthly plan loaded and priority input ready');}
async function month(page,value) {await panel(page).getByLabel('Month',{exact:true}).fill(value);await eventually(async()=>await panel(page).getByLabel('Month',{exact:true}).inputValue()===value,'requested month selected');}
async function refresh(page) {await page.evaluate(()=>window.dispatchEvent(new Event('focus')));}
async function submitTwice(page) {await panel(page).locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
async function saveText(page,text) {await input(page).fill(text);await add(page).click();await status(page,'Saved').waitFor();}
async function fixtureScenario(name,fn,options={}) {
  if(process.env.MONTHLY_TEST_FILTER&&!name.includes(process.env.MONTHLY_TEST_FILTER))return;
  const context = await browser.newContext({viewport:options.viewport||{width:1440,height:1000},serviceWorkers:'block'});
  context.setDefaultTimeout(6000);
  const plans=new Map([[MONTH,makePlan(MONTH,options.planOptions)]]);
  for(const plan of options.plans||[])plans.set(plan.month,clone(plan));
  const state={plans,props:{...dashboardProps(),...options.props},gets:[],puts:[],unexpected:[],errors:[],assertions:[],onGet:null,onPut:null,releases:[],screenshots:[],requests:[]};
  const response = async(route,status,body,type='application/json')=>{
    const bytes=Buffer.from(typeof body==='string'?body:JSON.stringify(body));
    state.requests.push({method:route.request().method(),url:route.request().url(),status,bodyBytes:bytes.length});
    try {await route.fulfill({status,contentType:type,headers:{'Cache-Control':'no-store'},body:bytes});}catch(error){state.requests.at(-1).fulfillError=error.message;}
  };
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==ORIGIN){state.unexpected.push(request.url());await route.abort('blockedbyclient');return;}
    if(url.pathname==='/app.js')return response(route,200,js.toString(),'text/javascript');
    if(url.pathname==='/app.css')return response(route,200,css.toString(),'text/css');
    if(url.pathname==='/favicon.ico')return response(route,204,'','image/x-icon');
    if(url.pathname==='/'||url.pathname==='/dashboard')return response(route,200,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.__MONTHLY_FIXTURE__=${JSON.stringify(state.props).replaceAll('<','\\u003c')}</script><script src="/app.js"></script></body></html>`,'text/html');
    if(url.pathname==='/content-bank/approved-1')return response(route,200,'<!doctype html><title>Approved fixture</title><h1>Approved fixture detail</h1>','text/html');
    if(url.pathname==='/before')return response(route,200,'<!doctype html><title>Before dashboard</title><p>Fixture previous history entry</p>','text/html');
    if(url.pathname.startsWith('/fixture-media/')) {const asset=decodeURIComponent(url.pathname.slice('/fixture-media/'.length));const match=asset.match(/^fixture-owner\/asset-([1-8])\.svg$/);if(!match)return response(route,404,{error:'Unknown fixture media'});return response(route,200,mediaSvg(Number(match[1])),'image/svg+xml');}
    if(url.pathname==='/api/monthly-plan'&&request.method()==='GET') {
      const key=url.searchParams.get('month');
      if(!plans.has(key))plans.set(key,makePlan(key,{priorities:[],entries:[]}));
      const snapshot=clone(plans.get(key));const call={month:key,snapshot,index:state.gets.length,page:request.frame().page()};state.gets.push(call);
      const override=state.onGet?await state.onGet(call):null;
      return response(route,override?.status||200,override?.body??snapshot);
    }
    if(url.pathname==='/api/monthly-plan'&&request.method()==='PUT') {
      const body=request.postDataJSON(), call={body:clone(body),index:state.puts.length,page:request.frame().page()};state.puts.push(call);
      const override=state.onPut?await state.onPut(call):null;
      if(override)return response(route,override.status,override.body);
      const saved=plans.get(body.month)||makePlan(body.month,{priorities:[],entries:[]});
      if(body.revision!==saved.features.revision)return response(route,409,{error:'Changed in another window. Your edits are kept.'});
      saved.features={month:body.month,revision:body.revision+1,priorities:clone(body.priorities)};plans.set(body.month,saved);
      return response(route,200,saved.features);
    }
    state.unexpected.push(request.url());await route.abort('blockedbyclient');
  });
  context.on('page',page=>page.on('pageerror',error=>state.errors.push(error.message)));
  const page=await context.newPage();
  try {
    if(options.before)await page.goto(`${ORIGIN}/before`);
    await page.goto(`${ORIGIN}/dashboard`,{waitUntil:'load'});
    await page.getByRole('heading',{name:'Your next two weeks'}).waitFor();
    if(options.autoReady!==false)await ready(page);
    await fn({page,context,state});
    assert.deepEqual(state.unexpected,[],'all traffic stays within explicitly intercepted fake fixtures');
    assert.deepEqual(state.errors,[],'no uncaught component errors');
    results.push({name,status:'passed',assertions:state.assertions,gets:state.gets.length,puts:state.puts.length});console.log(`PASS ${name}`);
  }catch(error){
    results.push({name,status:'failed',error:error.stack,assertions:state.assertions});console.error(`FAIL ${name}: ${error.message}`);
    try{await screenshot(page,`${name}-FAIL.png`);}catch{}
  }finally{
    for(const release of state.releases)release();
    traces.push({scenario:name,requests:state.requests,gets:state.gets.map(({month,snapshot,index})=>({month,revision:snapshot.features.revision,index})),puts:state.puts.map(({body,index})=>({body,index})),unexpectedRequests:state.unexpected,uncaughtErrors:state.errors});
    await context.close();
  }
}
function scenario(name,fn,options={}) {planned.push({name,fn,options});}

scenario('desktop-dashboard-appearance-collapse-preserves-six-drafts',async({page,state})=>{
  assert.equal(await cards(page).count(),6);
  const order=await cards(page).locator('img').evaluateAll(elements=>elements.map(img=>new URL(img.src).pathname));
  assert.deepEqual(order,expectedMedia);
  const sizes=await cards(page).evaluateAll(elements=>elements.map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width})));
  assert.equal(sizes[0].y,sizes[1].y);assert.equal(sizes[1].y,sizes[2].y);assert(sizes[3].y>sizes[0].y);
  assert.equal(await panel(page).getAttribute('role'),'complementary');
  assert.equal(await panel(page).getAttribute('aria-modal'),null);
  assert.equal(await toggle(page).getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  const panelBounds=await panel(page).boundingBox();assert(panelBounds.x>sizes[2].x+sizes[2].width);
  await screenshot(page,'monthly-desktop-1440x1000-open.png');
  await button(page,'Close monthly plan').click();await panel(page).waitFor({state:'hidden'});
  assert.equal(await toggle(page).getAttribute('aria-expanded'),'false');
  const expanded=await cards(page).first().boundingBox();assert(expanded.width>sizes[0].width);
  assert.deepEqual(await cards(page).locator('img').evaluateAll(elements=>elements.map(img=>new URL(img.src).pathname)),order);
  await screenshot(page,'monthly-desktop-1440x1000-collapsed.png');
  await toggle(page).click();await ready(page);assert.equal(await cards(page).count(),6);
  check(state,'Actual dashboard is a three-column, six-draft grid; initial asset ordering is preserved before/after panel collapse; accessible expanded state and no horizontal overflow');
});

scenario('laptop-panel-scroll-and-calendar-has-only-real-entries',async({page,state})=>{
  assert.equal(await panel(page).getByText('Unscheduled · 7',{exact:true}).count(),1);
  assert.equal(await button(page,'2026-10-05, 1 post').isEnabled(),true);
  assert.equal(await button(page,'2026-10-06').isDisabled(),true);
  assert.equal(await button(page,'2026-09-30').isDisabled(),true);
  await button(page,'2026-10-05, 1 post').click();assert.equal(await panel(page).locator('ol > li').count(),1);
  await button(page,'Show month').click();assert.equal(await panel(page).locator('ol > li').count(),9);
  assert.equal(await panel(page).getByRole('link',{name:'Our autumn gathering'}).getAttribute('href'),'/content-bank/approved-1');
  await input(page).scrollIntoViewIfNeeded();assert.equal(await input(page).isVisible(),true);
  await screenshot(page,'monthly-laptop-1280x650-priorities.png');
  assert.equal(state.puts.length,0);
  check(state,'Only API-backed dates are enabled; adjacent-month and empty dates are disabled, planning dates do not cause a save or imply scheduling; lower panel controls scroll into view');
},{viewport:{width:1280,height:650}});

scenario('dirty-month-buffers-survive-switch-close-and-refresh',async({page,state})=>{
  await input(page).fill('October unfinished wording');await status(page,'Unsaved').waitFor();
  await month(page,'2026-11');await ready(page);await input(page).fill('November independent wording');
  await button(page,'Close monthly plan').click();await toggle(page).click();await ready(page);
  assert.equal(await input(page).inputValue(),'November independent wording');
  await month(page,MONTH);await ready(page);assert.equal(await input(page).inputValue(),'October unfinished wording');
  const before=state.gets.length;await refresh(page);await eventually(()=>state.gets.length>before,'focus refresh requested');await sleep(150);
  assert.equal(await input(page).inputValue(),'October unfinished wording');await status(page,'Unsaved').waitFor();
  await month(page,'2026-11');await ready(page);assert.equal(await input(page).inputValue(),'November independent wording');
  assert.equal(state.puts.length,0);check(state,'Each month retains its own unsaved buffer across navigation, panel close/reopen, and equal-revision GET refresh; honest Unsaved status');
});

scenario('priority-add-edit-remove-persists-cross-refresh',async({page,state})=>{
  await saveText(page,'Fixture saved after refresh');assert.equal(state.puts.length,1);
  await page.reload();await ready(page);assert.equal(await panel(page).getByText('Fixture saved after refresh',{exact:true}).count(),1);
  await button(page,'Edit priority: Fixture saved after refresh').click();
  await input(page).fill('Fixture revised after refresh');await button(page,'Save changes').click();await status(page,'Saved').waitFor();
  await page.reload();await ready(page);assert.equal(await panel(page).getByText('Fixture revised after refresh',{exact:true}).count(),1);
  await button(page,'Remove priority: Fixture revised after refresh').click();await status(page,'Saved').waitFor();
  await page.reload();await ready(page);assert.equal(await panel(page).getByText('Fixture revised after refresh',{exact:true}).count(),0);
  assert.equal(state.plans.get(MONTH).features.revision,3);assert.equal(state.puts.length,3);
  check(state,'Add/edit/remove each persists through real page reloads against the fake durable store; revisions advance exactly once per mutation');
});

scenario('double-submit-and-switch-while-save-pending',async({page,state})=>{
  const gate=deferred();state.releases.push(gate.resolve);state.onPut=async()=>{await gate.promise;return null;};
  await input(page).fill('Save October exactly once');await submitTwice(page);
  await eventually(()=>state.puts.length===1,'one PUT entered');await status(page,'Saving…').waitFor();
  assert.equal(await input(page).isDisabled(),true);assert.equal(await add(page).isDisabled(),true);
  await month(page,'2026-11');await ready(page);await input(page).fill('Keep November text while October finishes');
  gate.resolve();await eventually(()=>state.plans.get(MONTH).features.revision===1,'October durable fixture save finishes');await sleep(150);
  assert.equal(await input(page).inputValue(),'Keep November text while October finishes');await status(page,'Unsaved').waitFor();
  await month(page,MONTH);await ready(page);assert.equal(await input(page).inputValue(),'');
  assert.equal(await panel(page).getByText('Save October exactly once',{exact:true}).count(),1);assert.equal(state.puts.length,1);
  check(state,'Synchronous duplicate submits create one PUT; pending month cannot be edited; finishing an older-month save cannot clear the current month buffer');
});

scenario('out-of-order-month-and-same-month-get-races',async({page,state})=>{
  const gate=deferred();state.releases.push(gate.resolve);let held=false;
  state.onGet=async call=>{if(call.month===MONTH&&!held){held=true;await gate.promise;}return null;};
  await refresh(page);await eventually(()=>held,'older October request held');
  await month(page,'2026-11');await ready(page);await input(page).fill('November remains selected');gate.resolve();await sleep(200);
  assert.equal(await panel(page).getByLabel('Month',{exact:true}).inputValue(),'2026-11');assert.equal(await input(page).inputValue(),'November remains selected');
  await month(page,MONTH);await ready(page);
  const old=deferred();state.releases.push(old.resolve);let oldHeld=false;
  state.onGet=async call=>{if(call.month===MONTH&&!oldHeld){oldHeld=true;await old.promise;}return null;};
  await refresh(page);await eventually(()=>oldHeld,'same-month old snapshot held');
  state.plans.get(MONTH).features={month:MONTH,revision:1,priorities:[{id:priorityId(44),text:'Newest server revision'}]};
  await refresh(page);await panel(page).getByText('Newest server revision',{exact:true}).waitFor();old.resolve();await sleep(200);
  assert.equal(await panel(page).getByText('Newest server revision',{exact:true}).count(),1);assert.equal(await panel(page).getByText('Autumn menu launch',{exact:true}).count(),0);
  check(state,'Old month GET cannot switch or clear current month; stale same-month GET cannot replace a later response');
});

scenario('stale-get-cannot-overwrite-just-saved-priority',async({page,state})=>{
  const gate=deferred();state.releases.push(gate.resolve);let held=false;
  state.onGet=async()=>{held=true;await gate.promise;return null;};
  await refresh(page);await eventually(()=>held,'pre-save stale GET held');
  await saveText(page,'Newly saved beats old GET');gate.resolve();await sleep(200);
  assert.equal(await panel(page).getByText('Newly saved beats old GET',{exact:true}).count(),1);await status(page,'Saved').waitFor();
  assert.equal(await input(page).inputValue(),'');check(state,'GET begun before save is invalidated and cannot clobber saved revision or success state');
});

scenario('failed-save-keeps-buffer-and-allows-explicit-retry',async({page,state})=>{
  state.onPut=async call=>call.index===0?{status:503,body:{error:'Fixture temporary save failure. Your edits are kept.'}}:null;
  await input(page).fill('Do not lose this input');await add(page).click();await panel(page).getByRole('alert').waitFor();
  assert.equal(await input(page).inputValue(),'Do not lose this input');await status(page,'Unsaved').waitFor();assert.equal(await input(page).isEnabled(),true);
  await screenshot(page,'monthly-save-failed-input-retained.png');
  await add(page).click();await status(page,'Saved').waitFor();assert.equal(state.puts.length,2);assert.equal(state.plans.get(MONTH).features.revision,1);
  check(state,'503 retains exact input, shows actionable error and Unsaved, and explicit retry persists once');
});

scenario('failed-removal-retry-and-cancel-keep-honest-dirty-state',async({page,state})=>{
  state.onPut=async call=>call.index===0||call.index===2?{status:503,body:{error:'Fixture remove failure'}}:null;
  await button(page,'Remove priority: Autumn menu launch').click();await panel(page).getByRole('alert').waitFor();
  await status(page,'Unsaved').waitFor();assert.equal(await input(page).inputValue(),'');
  assert.equal(await panel(page).getByText('Autumn menu launch',{exact:true}).count(),1);
  await button(page,'Retry save').click();await status(page,'Saved').waitFor();
  assert.equal(await panel(page).getByText('Autumn menu launch',{exact:true}).count(),0);
  await button(page,'Remove priority: Meet the team').click();await panel(page).getByRole('alert').waitFor();await status(page,'Unsaved').waitFor();
  await button(page,'Cancel').click();assert.equal(await panel(page).getByRole('alert').count(),0);assert.equal(await status(page,'Unsaved').count(),0);
  assert.equal(await panel(page).getByText('Meet the team',{exact:true}).count(),1);assert.equal(state.puts.length,3);assert.equal(state.plans.get(MONTH).features.revision,1);
  check(state,'Failed removal retains saved row and pending dirty state, explicit retry succeeds, and Cancel abandons a failed deletion without inventing another write');
});

scenario('edit-buffer-keeps-target-across-months-and-close',async({page,state})=>{
  await button(page,'Edit priority: Autumn menu launch').click();await input(page).fill('October edit stays attached to its ID');
  await month(page,'2026-11');await ready(page);await input(page).fill('Separate November addition');
  await month(page,MONTH);await ready(page);assert.equal(await input(page).inputValue(),'October edit stays attached to its ID');
  assert.equal(await button(page,'Save changes').count(),1);
  await button(page,'Close monthly plan').click();await toggle(page).click();await ready(page);
  assert.equal(await input(page).inputValue(),'October edit stays attached to its ID');await button(page,'Save changes').click();await status(page,'Saved').waitFor();
  assert.equal(state.plans.get(MONTH).features.priorities.length,2);assert.equal(state.plans.get(MONTH).features.priorities[0].id,priorityId(1));
  await month(page,'2026-11');await ready(page);assert.equal(await input(page).inputValue(),'Separate November addition');
  check(state,'Edit ID and edited text survive month navigation and close/reopen, update the same priority rather than duplicating it, and leave another month buffer intact');
});

scenario('two-tab-cas-conflict-explicit-save-my-version',async({page,context,state})=>{
  const second=await context.newPage();await second.goto(`${ORIGIN}/dashboard`);await ready(second);
  await input(second).fill('Second window local version');
  await saveText(page,'First window saved version');
  await second.locator('#monthly-plan-panel form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await panel(second).getByRole('alert').waitFor();assert.equal(await input(second).inputValue(),'Second window local version');
  assert.equal(state.puts.length,2);assert.equal(state.plans.get(MONTH).features.revision,1);
  await button(second,'Review latest').click();await button(second,'Save my version').waitFor();
  assert.equal(await input(second).isDisabled(),true);assert.equal(await panel(second).getByText('First window saved version',{exact:true}).count(),1);
  await screenshot(second,'monthly-two-tab-conflict-review.png');
  await button(second,'Save my version').click();await status(second,'Saved').waitFor();
  assert.equal(state.plans.get(MONTH).features.revision,2);
  assert(state.plans.get(MONTH).features.priorities.some(p=>p.text==='Second window local version'));
  assert(!state.plans.get(MONTH).features.priorities.some(p=>p.text==='First window saved version'));
  await refresh(page);await panel(page).getByText('Second window local version',{exact:true}).waitFor();
  check(state,'Two actual browser tabs start at one revision; stale PUT conflicts without overwrite; explicit review shows latest; only Save my version overwrites after rebase');
});

scenario('two-tab-focus-conflict-keep-editing-retains-remote-addition',async({page,context,state})=>{
  const second=await context.newPage();await second.goto(`${ORIGIN}/dashboard`);await ready(second);
  await button(second,'Edit priority: Autumn menu launch').click();await input(second).fill('Locally edited menu wording');
  await saveText(page,'Other window added a new priority');await refresh(second);await panel(second).getByRole('alert').waitFor();
  assert.equal(await input(second).inputValue(),'Locally edited menu wording');
  await button(second,'Review latest').click();await button(second,'Keep editing').click();
  assert.equal(await input(second).inputValue(),'Locally edited menu wording');assert.equal(await input(second).isEnabled(),true);
  await button(second,'Save changes').click();await status(second,'Saved').waitFor();
  const priorities=state.plans.get(MONTH).features.priorities;assert(priorities.some(item=>item.text==='Other window added a new priority'));
  assert.equal(priorities.find(item=>item.id===priorityId(1)).text,'Locally edited menu wording');assert.equal(priorities.length,3);assert.equal(state.plans.get(MONTH).features.revision,2);
  check(state,'Focus-triggered changed GET preserves local edit; explicit Keep editing adopts reviewed revision, saves local wording to same ID, and keeps another window addition');
});

scenario('two-tab-keep-editing-recreates-remotely-removed-priority',async({page,context,state})=>{
  const second=await context.newPage();await second.goto(`${ORIGIN}/dashboard`);await ready(second);
  await button(second,'Edit priority: Autumn menu launch').click();await input(second).fill('Preserved wording after remote deletion');
  await button(page,'Remove priority: Autumn menu launch').click();await status(page,'Saved').waitFor();
  await refresh(second);await panel(second).getByRole('alert').waitFor();await button(second,'Review latest').click();await button(second,'Keep editing').click();
  assert.equal(await input(second).inputValue(),'Preserved wording after remote deletion');assert.equal(await add(second).isEnabled(),true);
  await add(second).click();await status(second,'Saved').waitFor();
  const priorities=state.plans.get(MONTH).features.priorities;assert.equal(priorities.length,2);
  assert(priorities.some(item=>item.text==='Preserved wording after remote deletion'));assert(!priorities.some(item=>item.id===priorityId(1)));
  check(state,'A remotely removed edit target becomes an explicit new addition after Keep editing, preserving local wording instead of silently discarding it');
});

scenario('two-tab-dirty-focus-refresh-and-use-saved',async({page,context,state})=>{
  const second=await context.newPage();await second.goto(`${ORIGIN}/dashboard`);await ready(second);
  await input(second).fill('Retain local buffer until explicit decision');await saveText(page,'Keep the saved remote choice');
  await refresh(second);await panel(second).getByRole('alert').waitFor();
  assert.equal(await input(second).inputValue(),'Retain local buffer until explicit decision');assert.equal(await input(second).isDisabled(),true);
  await button(second,'Review latest').click();await button(second,'Use saved').click();
  assert.equal(await input(second).inputValue(),'');assert.equal(await input(second).isEnabled(),true);
  assert.equal(await panel(second).getByText('Keep the saved remote choice',{exact:true}).count(),1);assert.equal(state.puts.length,1);
  check(state,'Changed focus GET keeps dirty local text and blocks accidental overwrite; Use saved is explicit and adopts remote without another PUT');
});

scenario('mobile-dialog-focus-trap-escape-and-dirty-reopen',async({page,state})=>{
  assert.equal(await panel(page).isVisible(),false);assert.equal(await toggle(page).getAttribute('aria-expanded'),'false');
  await toggle(page).click();await ready(page);assert.equal(await panel(page).getAttribute('role'),'dialog');assert.equal(await panel(page).getAttribute('aria-modal'),'true');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  assert.equal(await page.locator('.editorial-grid').evaluate(el=>Boolean(el.closest('[inert]'))),true);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'monthly-plan-panel');
  const targets=panel(page).locator('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]');
  const visible=await targets.evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent})));
  assert(visible.length>5);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Close monthly plan');
  await page.keyboard.press('Shift+Tab');assert.equal(await panel(page).evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Close monthly plan');
  await screenshot(page,'monthly-mobile-390x844-sheet.png');
  await input(page).fill('Mobile unfinished priority');await page.keyboard.press('Escape');await panel(page).waitFor({state:'hidden'});
  await eventually(()=>toggle(page).evaluate(el=>el===document.activeElement),'focus returns to Monthly plan trigger');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.equal(await page.locator('.editorial-grid').evaluate(el=>Boolean(el.closest('[inert]'))),false);
  await toggle(page).click();await ready(page);assert.equal(await input(page).inputValue(),'Mobile unfinished priority');await status(page,'Unsaved').waitFor();
  check(state,'Mobile starts collapsed; modal semantics, focus entry/trap/return and inert background work; Escape closes without losing unsaved buffer');
},{viewport:{width:390,height:844},autoReady:false});

scenario('mobile-browser-back-closes-sheet-without-leaving-dashboard',async({page,state})=>{
  await toggle(page).click();await ready(page);await input(page).fill('Keep this after browser Back');
  const beforeUrl=page.url();await page.goBack();
  await eventually(async()=>page.url()===beforeUrl&&!(await panel(page).isVisible()),'Back closes sheet and stays on dashboard');
  assert.equal(await page.getByRole('heading',{name:'Your next two weeks'}).count(),1);
  await toggle(page).click();await ready(page);assert.equal(await input(page).inputValue(),'Keep this after browser Back');
  check(state,'Browser Back consumes monthly-sheet history entry, remains on dashboard, and reopening restores dirty buffer');
},{viewport:{width:390,height:844},autoReady:false,before:true});

scenario('mobile-history-forward-reopens-without-extra-push',async({page,state})=>{
  const original=await page.evaluate(()=>history.length);
  await toggle(page).click();await ready(page);const opened=await page.evaluate(()=>history.length);assert.equal(opened,original+1);
  await page.goBack();await panel(page).waitFor({state:'hidden'});
  await eventually(()=>toggle(page).evaluate(el=>el===document.activeElement),'focus returns to Monthly plan trigger');
  const unrelated=page.locator('.editorial-overview-heading a[href="/approved-posts"]');
  for(let cycle=0;cycle<3;cycle++) {
    // Forward has no trigger activation. Make unrelated pre-open focus explicit
    // so restoration cannot pass merely because the trigger happened to retain it.
    await unrelated.focus();assert.equal(await unrelated.evaluate(el=>el===document.activeElement),true);
    await page.goForward();await ready(page);assert.equal(await page.evaluate(()=>history.length),opened);
    await button(page,'Close monthly plan').evaluate(el=>{el.click();el.click();});await panel(page).waitFor({state:'hidden'});
    assert.equal(new URL(page.url()).pathname,'/dashboard');
    await eventually(()=>toggle(page).evaluate(el=>el===document.activeElement),`Forward/Close cycle ${cycle+1} returns focus to Monthly plan trigger`);
  }
  await page.goBack();await eventually(()=>new URL(page.url()).pathname==='/before','Back after closing sheet returns to genuine preceding route');
  check(state,'Three Forward/Close cycles from explicitly unrelated focus restore the Monthly plan trigger without extra history entries; duplicate Close is locked to one history movement, and next Back leaves for the real prior route');
},{viewport:{width:390,height:844},autoReady:false,before:true});

scenario('mobile-keyboard-height-scroll-and-draft-open',async({page,state})=>{
  await toggle(page).click();await ready(page);await input(page).fill('Typing in the short viewport');
  await page.setViewportSize({width:390,height:400});await input(page).scrollIntoViewIfNeeded();
  const dimensions=await panel(page).boundingBox();assert(dimensions.y>=0);assert(dimensions.y+dimensions.height<=401);
  await add(page).scrollIntoViewIfNeeded();const action=await add(page).boundingBox();assert(action.y>=0&&action.y+action.height<=401);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await screenshot(page,'monthly-mobile-390x400-keyboard-height.png');
  await add(page).click();await status(page,'Saved').waitFor();
  await page.setViewportSize({width:390,height:844});await panel(page).getByRole('button',{name:'A season at the table',exact:true}).click();
  await page.getByRole('dialog',{name:'A season at the table',exact:true}).waitFor();assert.equal(await panel(page).isVisible(),false);
  assert.equal(await page.getByRole('dialog',{name:'A season at the table',exact:true}).locator('img.object-contain').getAttribute('src'),expectedMedia[0]);
  await page.getByRole('button',{name:'Next media',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'A season at the table',exact:true}).locator('img.object-contain').getAttribute('src'),'/fixture-media/'+encodeURIComponent('fixture-owner/asset-2.svg'));
  await page.getByRole('button',{name:'Previous media',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'A season at the table',exact:true}).locator('img.object-contain').getAttribute('src'),expectedMedia[0]);
  await screenshot(page,'monthly-mobile-draft-detail.png');
  check(state,'Shrinking viewport simulates keyboard-sized available space: sheet and save action stay reachable without horizontal overflow; a monthly draft opens actual existing detail');
},{viewport:{width:390,height:844},autoReady:false});

scenario('native-approved-link-warns-before-losing-dirty-buffer',async({page,state})=>{
  await input(page).fill('Do not silently lose this priority on navigation');
  const dialogs=[];page.once('dialog',async dialog=>{dialogs.push(dialog.type());await dialog.dismiss();});
  await panel(page).getByRole('link',{name:'Our autumn gathering',exact:true}).click({noWaitAfter:true});
  await eventually(()=>dialogs.length===1,'native approved-post navigation triggers beforeunload guard');
  assert.deepEqual(dialogs,['beforeunload']);assert.equal(new URL(page.url()).pathname,'/dashboard');
  assert.equal(await input(page).inputValue(),'Do not silently lose this priority on navigation');await status(page,'Unsaved').waitFor();
  await button(page,'Cancel').click();
  await Promise.all([page.waitForURL(`${ORIGIN}/content-bank/approved-1`),panel(page).getByRole('link',{name:'Our autumn gathering',exact:true}).click()]);
  await page.getByRole('heading',{name:'Approved fixture detail'}).waitFor();assert.equal(state.puts.length,0);
  check(state,'The actual panel native approved-post link invokes beforeunload while dirty; dismissing leave keeps exact buffer and location; canceling buffer then permits intended navigation');
});

scenario('new-remote-draft-offers-explicit-refresh-before-opening',async({page,state})=>{
  await toggle(page).click();await ready(page);
  const historyBefore=await page.evaluate(()=>({length:history.length,state:history.state}));
  state.plans.get(MONTH).entries.push({id:'draft:remote-new',draftId:'remote-new',date:'2026-10-19',title:'New draft from another window',status:'Draft'});
  await refresh(page);const control=panel(page).getByRole('button',{name:'New draft from another window Refresh to open'});await control.waitFor();
  assert.equal(await page.getByRole('dialog',{name:'New draft from another window',exact:true}).count(),0);
  assert.equal(await panel(page).isVisible(),true);assert.deepEqual(await page.evaluate(()=>({length:history.length,state:history.state})),historyBefore);
  state.props.savedSlots.push({draftId:'remote-new',planSlotId:'remote-slot',planningDate:'2026-10-19',planPosition:6,assetIds:['asset-8'],kind:'Photo',caption:'New draft from another window. Fresh wording.',originalCaption:'New draft from another window. Fresh wording.',purpose:'New draft from another window'});
  await Promise.all([page.waitForEvent('load'),control.click()]);
  await toggle(page).click();await ready(page);
  assert.equal(await panel(page).getByText('Refresh to open',{exact:true}).count(),0);
  await panel(page).getByRole('button',{name:'New draft from another window',exact:true}).click();
  await page.getByRole('dialog',{name:'New draft from another window',exact:true}).waitFor();
  assert.equal(await panel(page).isVisible(),false);
  assert.deepEqual(await cards(page).locator('img').evaluateAll(elements=>elements.slice(0,6).map(img=>new URL(img.src).pathname)),expectedMedia);
  check(state,'Unknown remote draft is clearly labeled Refresh to open and does not create unknown-detail history or silently close the sheet; explicit reload obtains draft, opens correct detail, and preserves original six media order');
},{viewport:{width:390,height:844},autoReady:false});

scenario('empty-month-and-no-phantom-planning-dates',async({page,state})=>{
  await month(page,'2027-02');await ready(page);await panel(page).getByText('No posts yet',{exact:true}).waitFor();
  assert.equal(await panel(page).locator('ol > li').count(),0);
  const enabledDates=await panel(page).locator('button[aria-label^="2027-"]').evaluateAll(els=>els.filter(el=>!el.disabled).length);assert.equal(enabledDates,0);
  assert.equal(await panel(page).getByText('Unscheduled',{exact:false}).count(),0);
  assert.equal(await panel(page).locator('button[aria-label^="2027-02-29"]').count(),0);
  await screenshot(page,'monthly-empty-february.png');assert.equal(state.puts.length,0);
  check(state,'Empty month shows truthful empty state, enables no phantom events, creates no save, and February calendar contains no impossible day');
});

scenario('invalid-api-calendar-date-is-rejected',async({page,state})=>{
  state.plans.set('2027-02',makePlan('2027-02',{priorities:[],entries:[{id:'bad-date',date:'2027-02-30',title:'Impossible phantom date',status:'Draft',draftId:'draft-1'}]}));
  await month(page,'2027-02');await panel(page).getByRole('alert').waitFor();
  assert.equal(await panel(page).getByText('Impossible phantom date',{exact:true}).count(),0);assert.equal(await input(page).isDisabled(),true);
  check(state,'Malformed API payload with impossible date is rejected rather than rendering a phantom event');
});

scenario('unavailable-load-does-not-pose-as-empty-and-retries',async({page,state})=>{
  let failed=false;state.onGet=async call=>call.month==='2026-11'&&!failed?(failed=true,{status:503,body:{error:'Fixture monthly planning unavailable'}}):null;
  await month(page,'2026-11');await panel(page).getByRole('alert').waitFor();assert.equal(await input(page).isDisabled(),true);
  assert.equal(await panel(page).getByText('No posts yet',{exact:true}).count(),0);
  await screenshot(page,'monthly-unavailable.png');await button(page,'Retry').click();await ready(page);
  await panel(page).getByText('No posts yet',{exact:true}).waitFor();assert.equal(await panel(page).getByRole('alert').count(),0);
  check(state,'Unavailable response disables edits and presents error instead of false empty state; Retry recovers');
});

scenario('priority-character-count-and-twenty-item-limit',async({page,state})=>{
  await input(page).fill('x'.repeat(1000));assert.equal(await input(page).getAttribute('maxlength'),'1000');
  await panel(page).getByText('1000 / 1000 characters',{exact:true}).waitFor();await button(page,'Cancel').click();
  state.plans.set('2026-11',makePlan('2026-11',{priorities:Array.from({length:20},(_,i)=>({id:priorityId(100+i),text:`Priority ${i+1}`})),entries:[]}));
  await month(page,'2026-11');await panel(page).getByText('20 priorities maximum',{exact:true}).waitFor();
  assert.equal(await input(page).isDisabled(),true);assert.equal(await add(page).isDisabled(),true);
  await button(page,'Edit priority: Priority 1').click();assert.equal(await input(page).isEnabled(),true);
  await input(page).fill('Updated within full list');await button(page,'Save changes').click();await status(page,'Saved').waitFor();
  assert.equal(state.plans.get('2026-11').features.priorities.length,20);
  await button(page,'Remove priority: Updated within full list').click();await status(page,'Saved').waitFor();assert.equal(await input(page).isEnabled(),true);
  check(state,'1000 character maximum and visible count; 20-item limit disables adding but allows edit/remove and re-enables input once under limit');
});

scenario('entry-cap-and-date-boundary-controls',async({page,state})=>{
  state.plans.set('2026-11',makePlan('2026-11',{priorities:[],truncated:true,entries:Array.from({length:200},(_,i)=>({id:`many-${i}`,date:`2026-11-${String(i%30+1).padStart(2,'0')}`,title:`Entry ${i+1}`,status:'Draft'}))}));
  await month(page,'2026-11');await ready(page);assert.equal(await panel(page).locator('ol > li').count(),200);await panel(page).getByText('Showing the first 200 posts',{exact:true}).waitFor();
  await month(page,'2000-01');await ready(page);assert.equal(await button(page,'Previous month').isDisabled(),true);
  await month(page,'2100-12');await ready(page);assert.equal(await button(page,'Next month').isDisabled(),true);
  assert.equal(await panel(page).getByLabel('Month',{exact:true}).getAttribute('min'),'2000-01');assert.equal(await panel(page).getByLabel('Month',{exact:true}).getAttribute('max'),'2100-12');
  check(state,'200-entry cap disclosure and bounded month navigation remain explicit');
});

try {
  const executablePath=process.env.CHROMIUM_PATH;
  browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true});
  for(const item of planned)await fixtureScenario(item.name,item.fn,item.options);
}catch(error){launchError=error.stack||String(error);console.error(launchError);process.exitCode=1;}
finally {
  if(browser)await browser.close();
  const coverageLimits=[
    'Production dashboard component, monthly panel, helper modules, Tailwind and CSS module are bundled unchanged. Next/link and Supabase media URL access are adapted only in test entry/build, never in application code.',
    'Fixture API persistence/CAS/failures/races exercise browser state contracts only. Actual Next.js routes, Supabase authentication, RLS, SQL transaction enforcement and deployed persistence require separate route/database tests.',
    'All media are generated SVG fixture illustrations and all data are fictional. No production data, external media network, cookies, credentials, session bypasses or live writes are used.',
    'No web server is launched. Context-wide interception fulfills or blocks every browser request, with service workers disabled.',
    'Keyboard viewport coverage shrinks Chromium layout viewport while editing; it does not establish behavior of a real iOS/Android virtual keyboard or safe-area hardware.',
    'Wrapper reflects the dashboard page content container. App Router, server-side dashboard loader and global authenticated application navigation are outside the fixture.',
  ];
  const report={generatedAt:new Date().toISOString(),executionStatus:launchError?'blocked':results.some(r=>r.status==='failed')?'failed':'passed',...buildEvidence,browser:'Chromium via Playwright',origin:ORIGIN,noLocalServer:true,launchError,plannedScenarioCount:planned.length,plannedScenarios:planned.map(item=>item.name),executedScenarioCount:results.length,results,screenshots,unexpectedRequests:traces.flatMap(t=>t.unexpectedRequests),coverageLimits};
  await fs.writeFile(path.join(evidence,'monthly-browser-regression-report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(evidence,'monthly-browser-request-traces.json'),JSON.stringify(traces,null,2));
  if(launchError)await fs.writeFile(path.join(evidence,'monthly-browser-launch-blocked.json'),JSON.stringify({status:'blocked',generatedAt:new Date().toISOString(),diagnostic:launchError,executedScenarios:results.length,requestedScreenshotsCreated:screenshots.length},null,2));
  await fs.writeFile(path.join(evidence,'monthly-browser-regression-summary.md'),`# Monthly planning browser regression\n\n${launchError?`BLOCKED: ${planned.length} prepared browser scenarios remain unexecuted. Launch failed: ${launchError.split('\n')[0]}. No screenshots were created.`:`${results.filter(r=>r.status==='passed').length}/${results.length} executed scenarios passed.`}\n\nActual dashboard, panel, CSS module and Tailwind compiled successfully. Fake-only HTTPS origin, no server or production traffic.\n\n${results.map(r=>`- ${r.status.toUpperCase()}: ${r.name}${r.error?' — '+r.error.split('\n')[0]:''}`).join('\n')}\n\n## Prepared scenarios\n${planned.map(item=>'- '+item.name).join('\n')}\n\n## Coverage limits\n${coverageLimits.map(line=>'- '+line).join('\n')}\n`);
  console.log(`MONTHLY_PLANNING_SUITE ${JSON.stringify({status:report.executionStatus,planned:planned.length,executed:results.length,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,screenshots:screenshots.length,unexpectedRequests:report.unexpectedRequests.length,bundleSha256:report.bundleSha256})}`);
}
if(results.some(result=>result.status==='failed'))process.exitCode=1;
