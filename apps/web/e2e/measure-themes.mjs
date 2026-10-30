/** Reference-machine measurements with synthetic source records. No live backend. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const output=path.join(root,'.nuclear/changes/overlay-themes/evidence');
const shots=path.join(output,'screenshots');fs.mkdirSync(shots,{recursive:true});
const text=fs.readFileSync(path.join(root,'apps/web/src/features/floor/themes/catalog.ts'),'utf8');
const catalog=JSON.parse(text.slice(text.indexOf(' = ')+3,text.lastIndexOf(';')));
const base=process.env.THEME_BENCH_URL??'http://127.0.0.1:4181';
const packages=[],views={},office=[];
for(let i=0;i<12;i++){
 const id=`WP-P${i}`;
 const pkg={schema_version:'0.1.0',id,revision:0,title:'Synthetic performance fixture',project:'benchmark',mode:i===1?'capital-projects':'general',status:i>=6?'accepted':i===2?'in-verification':'in-work',rigor_mode:'quick',data_lane:'internal',objective:'Measure UI rendering, not engineering work',deliverables:[],design_inputs:[],agent_assignment:[],acceptance_criteria:[],verification:{method:'agent-pre-check',verifier:'independent',verifier_receives:[],required_custody:{decisive_evidence_generated_by:'verifier',preparer_may_present:false}}};
 const runs=i<4?Array.from({length:6},(_,j)=>({schema_version:'0.1.0',id:`R-${i}-${j}`,package_id:id,package_revision:0,role:i===2?'pre-check':'author',agent_baseline:'sample',runtime:{kind:'local',provider:'fixture',model:'sample'},round:j+1,status:i===3?'queued':'running',queued_at:'2026-10-26T12:00:00Z',label:'Synthetic work'})):[];
 packages.push(pkg);views[id]={package:pkg,runs,outputs:[],decisions:[],subject_digest:{algorithm:'sha256',value:'0'.repeat(64)}};
 if(i<6)office.push({kind:'permission',package_id:id,package_revision:0,title:'Sample request',detail:'Synthetic attention marker',since:'2026-10-26T12:00:00Z'});
}
async function mock(page){
 await page.route('**/auth/session',r=>r.fulfill({json:{registered:true,signed_in:true,user:'Benchmark'}}));
 await page.route('**/office',r=>r.fulfill({json:office}));
 await page.route('**/events/stream',r=>r.fulfill({contentType:'text/event-stream',body:': alive\n\n'}));
 await page.route('**/packages**',r=>{const id=new URL(r.request().url()).pathname.split('/')[2];return r.fulfill({json:id?views[id]:packages});});
}
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1200}});const page=await context.newPage();await mock(page);
await page.addInitScript(()=>localStorage.setItem('cr.floor.preferences.v1',JSON.stringify({schemaVersion:1,themeId:'plain',motion:'full',view:'scene'})));
await page.goto(base+'/floor');await page.getByRole('combobox',{name:/Packages/}).selectOption('all');await page.locator('.floor-actor').nth(35).waitFor();
async function activate(p,id,title){
 await p.locator('.floor-theme-trigger').click();const start=Date.now();await p.getByRole('button',{name:`Use ${title} theme`,exact:true}).click();
 await p.getByRole('group',{name:`${title} activity scene`}).waitFor();await p.getByRole('dialog').waitFor({state:'hidden'});return Date.now()-start;
}
// Bind every measurement to the exact source commit and served build.
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain','--untracked-files=no'))throw new Error('Commit or discard tracked changes first: measurements must bind to a commit');
const dist=process.env.THEME_BENCH_DIST;
if(!dist||!fs.existsSync(dist))throw new Error('Set THEME_BENCH_DIST to the build directory being served');
const builtFiles=fs.readdirSync(dist,{recursive:true}).map(String).filter(f=>fs.statSync(path.join(dist,f)).isFile()).sort().map(f=>{const data=fs.readFileSync(path.join(dist,f));return{path:f,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length};});
const report={date:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),builtFiles,scope:'Synthetic 36-entity source fixture; local headless reference machine only',environment:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,node:process.version,browser:browser.version(),viewport:{width:1440,height:1200},cache:'Warm frame/cached switch; fresh browser context + CDP 10 Mbps / 100 ms RTT for cold load'},targets:{frameP95Ms:33,cachedSwitchMs:250,coldActivationMs:2000,frameSampleSeconds:30},worlds:[]};
try{
 for(const world of catalog){
  await activate(page,world.id,world.title);await page.bringToFront();
  const timing=await page.evaluate(()=>new Promise(resolve=>{const values=[];let previous=performance.now();const start=previous;function frame(now){values.push(now-previous);previous=now;if(now-start>=30000){values.shift();values.sort((a,b)=>a-b);resolve({frames:values.length,p95:values[Math.floor(values.length*.95)]});}else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
  await page.screenshot({path:path.join(shots,`${world.id}.png`),fullPage:true,animations:'disabled'});
  await activate(page,'plain','Plain Floor');const cached=await activate(page,world.id,world.title);
  const coldContext=await browser.newContext({viewport:{width:1440,height:1200}});const cold=await coldContext.newPage();await mock(cold);
  const cdp=await coldContext.newCDPSession(cold);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:1250000,uploadThroughput:1250000,latency:100});
  await cold.goto(base+'/floor');const coldTime=await activate(cold,world.id,world.title);await coldContext.close();await page.bringToFront();
  const row={id:world.id,title:world.title,actors:36,frames:timing.frames,frameP95Ms:Math.round(timing.p95*100)/100,cachedSwitchMs:cached,coldActivationMs:coldTime,pass:timing.p95<=33&&cached<=250&&coldTime<=2000};report.worlds.push(row);
  report.summary={packs:report.worlds.length,maxFrameP95Ms:Math.max(...report.worlds.map(w=>w.frameP95Ms)),maxCachedSwitchMs:Math.max(...report.worlds.map(w=>w.cachedSwitchMs)),maxColdActivationMs:Math.max(...report.worlds.map(w=>w.coldActivationMs))};
  fs.writeFileSync(path.join(output,'performance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(row));
 }
}finally{await browser.close();}
if(report.worlds.length!==15||report.worlds.some(w=>!w.pass))process.exitCode=1;
