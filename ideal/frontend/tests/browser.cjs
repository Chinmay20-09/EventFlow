const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'eventflow-test-'));
const base='http://127.0.0.1:4317';
let server,browser;
async function start(){
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4317'],{cwd:root,env:{...process.env,EVENTFLOW_DATA_DIR:data,GOOGLE_MAPS_API_KEY:'test-only-not-a-real-key'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',()=>{});server.stderr.on('data',b=>process.stderr.write(b));
 for(let n=0;n<100;n++){try{if((await fetch(base+'/api/auth')).ok)return}catch{}await new Promise(r=>setTimeout(r,200))}
 throw Error('Server did not start');
}
async function stop(){if(server&&server.exitCode===null){const end=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await end}}
function fakeGoogle(){
 window.__maps=[];window.__layers=[];
 class Point{constructor(p){this.p=p}lat(){return this.p.lat}lng(){return this.p.lng}toJSON(){return {...this.p}}}
 class Bounds{constructor(b){this.b=b}contains(p){p=p.toJSON?.()??p;const b=this.b;return p.lat>=b.south&&p.lat<=b.north&&p.lng>=b.west&&p.lng<=b.east}toJSON(){return {...this.b}}}
 class Map{
  constructor(host,o){this.options=o;this.zoom=o.zoom;this.center=o.center;this.handlers={};this.calls=[];window.__maps.push(this);host.addEventListener('click',()=>this.handlers.click?.({latLng:new Point(this.center)}))}
  addListener(k,f){this.handlers[k]=f;return {remove(){}}}
  setOptions(o){this.calls.push(o);Object.assign(this.options,o)}
  setZoom(z){this.zoom=Math.max(z,this.options.minZoom??0)}
  getZoom(){return this.zoom}
  setCenter(p){const b=this.options.restriction?.latLngBounds;this.center=b?{lat:Math.max(b.south,Math.min(b.north,p.lat)),lng:Math.max(b.west,Math.min(b.east,p.lng))}:p}
  getCenter(){return new Point(this.center)}
  panTo(p){this.setCenter(p)}
  fitBounds(b){this.bounds=b;this.setCenter({lat:(b.north+b.south)/2,lng:(b.east+b.west)/2});this.setZoom(12)}
  getBounds(){return new Bounds(this.bounds??{north:this.center.lat+.05,south:this.center.lat-.05,east:this.center.lng+.05,west:this.center.lng-.05})}
 }
 class Layer{
  constructor(options={}){this.options=options;this.map=options.map;this.handlers={};this.kind=this.constructor.name;window.__layers.push(this)}
  setMap(m){this.map=m}addListener(k,f){this.handlers[k]=f;return {remove(){}}}setPosition(p){this.options.position=p}
  get(k){return this.options[k]}set(k,v){this.options[k]=v}
 }
 window.google={maps:{Map,LatLngBounds:Bounds,Marker:class Marker extends Layer{},Rectangle:class Rectangle extends Layer{},Polyline:class Polyline extends Layer{},TrafficLayer:class TrafficLayer extends Layer{},SymbolPath:{CIRCLE:0},event:{clearInstanceListeners(o){o.handlers={}}}}};
 window.eventFlowGoogleReady();
}
(async()=>{
 try{
  await start();
  assert.equal((await (await fetch(base+'/api/map-config')).json()).apiKey,'test-only-not-a-real-key');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://maps.googleapis.com/maps/api/js?**',r=>r.fulfill({contentType:'application/javascript',body:'('+fakeGoogle.toString()+')()'}));
  await page.route('**/api/photo?**',r=>r.fulfill({json:{photo:null}}));
  await page.route('**/api/geo?**',r=>r.fulfill({json:{display_name:'Test pin'}}));
  await page.goto(base+'/');
  await page.waitForURL('**/admin');
  assert.equal(await page.locator('#map').count(),0);
  assert.equal(await page.getByRole('navigation',{name:'Event pages'}).count(),0);
  await page.getByRole('tab',{name:'Sign up',exact:true}).click();
  await page.getByLabel('User ID',{exact:true}).fill('a');
  await page.getByLabel('User name',{exact:true}).fill('Test administrator');
  await page.getByLabel('Password',{exact:true}).fill('x');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.waitForURL('**/live-map');
  console.log('PASS simple signup with one-character credentials redirects to live map');
  const api=context.request;
  const post=async(path,body,expected=200)=>{
   const response=await api.post(base+path,{headers:{Origin:base},data:body});
   assert.equal(response.status(),expected,await response.text());return response.json();
  };
  const {event}=await post('/api/event',{name:'Test event',city:'Test city',lat:19.1,lon:72.9,bounds:{north:19.2,south:19,east:73,west:72.8}});
  await page.reload();await page.waitForFunction(()=>window.__maps?.length===1&&window.__maps[0].center.lat===19.1);
  await page.getByRole('button',{name:'Save event area',exact:true}).click();
  await page.getByRole('button',{name:'Unlock & reframe',exact:true}).waitFor();
  await page.waitForFunction(()=>window.__maps[0].options.minZoom===12);
  const saved=(await (await api.get(base+'/api/events/'+event.id+'/graph')).json()).location;
  assert.equal(saved.zoom,12);
  await post('/api/events/'+event.id+'/location',saved,409);
  console.log('PASS real bounds and zoom saved, repeat save refused until unlock');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.waitForFunction(()=>window.__maps[0].zoom===13);
  for(const phase of ['nodes','routes','map','nodes','routes']){
   await page.getByRole('tab',{name:phase,exact:true}).click();
   await page.waitForTimeout(50);
   const s=await page.evaluate(()=>({count:window.__maps.length,zoom:window.__maps[0].zoom,options:window.__maps[0].options}));
   assert.equal(s.count,1);assert.equal(s.zoom,13);assert.equal(s.options.minZoom,12);assert.equal(s.options.maxZoom,undefined);
   assert.deepEqual(s.options.restriction,{latLngBounds:saved.bounds,strictBounds:true});
  }
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__maps[0].zoom),12);
  console.log('PASS one map instance across all phases; zoom in retained; zoom out stops at saved floor');
  await page.evaluate(()=>window.__maps[0].handlers.click({latLng:{lat:()=>19.1,lng:()=>72.9,toJSON:()=>({lat:19.1,lng:72.9})}}));
  await page.getByLabel('Name',{exact:true}).fill('Gate A');
  await page.getByLabel('Type',{exact:true}).selectOption('gate');
  await page.getByLabel('People the place can hold',{exact:true}).fill('50');
  await page.getByRole('button',{name:'Save information',exact:true}).click();
  await page.getByRole('heading',{name:'Edit node',exact:true}).waitFor();
  const graph=await (await api.get(base+'/api/events/'+event.id+'/graph')).json();
  assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].capacity,50);
  await page.getByLabel('People the place can hold',{exact:true}).fill('60');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByText('Node saved.',{exact:true}).waitFor();
  const updated=await (await api.get(base+'/api/events/'+event.id+'/graph')).json();
  assert.equal(updated.nodes[0].capacity,60);
  await post('/api/events/'+event.id+'/nodes',{name:'Outside',type:'gate',status:'active',capacity:10,latitude:0,longitude:0},503);
  console.log('PASS pin creation and node POST/PATCH, outside-bounds node rejected');
  await page.getByRole('switch',{name:'Dark mode'}).click();
  for(const label of ['AI Sandbox','Updates','Reports','Live Map']){
   await page.getByRole('navigation',{name:'Event pages'}).getByRole('link',{name:label,exact:true}).click();
   await page.waitForTimeout(100);
   assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('dark')),true);
   assert.equal(await page.getByRole('navigation',{name:'Event pages'}).getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
  }
  console.log('PASS all four sidebar routes and persistent dark theme');
  for(const width of [375,768,1440]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const bounds=await page.locator('#map').boundingBox();assert.ok(bounds.width>0&&bounds.height>0);
   if(width<1024){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Event pages'}).getByRole('link',{name:'Reports',exact:true}).click();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Event pages'}).getByRole('link',{name:'Live Map',exact:true}).click()}
  }
  assert.deepEqual(errors,[]);
  console.log('PASS 375/768/1440 widths: no horizontal overflow; drawer navigates; no browser exceptions');
  await stop();await start();
  assert.equal((await (await api.get(base+'/api/auth')).json()).user.userId,'a');
  const persisted=await (await api.get(base+'/api/events/'+event.id+'/graph')).json();
  assert.deepEqual(persisted.location,saved);assert.equal(persisted.nodes[0].capacity,60);
  console.log('PASS account, session, bounds, zoom and nodes persist across server restart');
  await page.setViewportSize({width:1440,height:900});await page.goto(base+'/live-map');
  await page.waitForFunction(()=>window.__maps?.[0]?.options.minZoom===12);
  await page.getByRole('button',{name:'Unlock & reframe',exact:true}).click();
  await page.getByRole('button',{name:'Save event area',exact:true}).waitFor();
  await page.waitForFunction(()=>window.__maps[0].options.restriction===null);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__maps[0].zoom)<12,true);
  await post('/api/auth',{action:'logout'});
  await post('/api/auth',{action:'login',userId:'a',password:'wrong'},401);
  await post('/api/auth',{action:'login',userId:'a',password:'x'});
  console.log('PASS explicit unlock clears lock; incorrect password rejected; existing account logs in');
  console.log('Google SDK mocked for interaction checks. Live Google tiles/traffic not verified without a real key.');
 }finally{await browser?.close();await stop()}
})().catch(error=>{console.error(error);process.exitCode=1});
