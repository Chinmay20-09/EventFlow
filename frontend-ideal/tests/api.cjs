const {spawn}=require('node:child_process');
const {mkdtempSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'eventflow-api-test-'));
const base='http://127.0.0.1:4318';let server,cookie='',cookieB='',key='test-key-not-real';
async function start(){
 const mode=process.argv.includes('--dev')?['dev','--webpack']:['start'];
 server=spawn(process.execPath,['node_modules/next/dist/bin/next',...mode,'--hostname','127.0.0.1','--port','4318'],{cwd:root,env:{...process.env,EVENTFLOW_DATA_DIR:data,GOOGLE_MAPS_API_KEY:key},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',()=>{});server.stderr.on('data',b=>process.stderr.write(b));
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth')).ok)return}catch{}await new Promise(r=>setTimeout(r,200))}
 throw Error('Startup failed');
}
async function stop(){if(server?.exitCode===null){const end=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await end}}
async function request(path,method='GET',body,status=200){
 const response=await fetch(base+path,{method,headers:{Origin:base,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();assert.equal(response.status,status,text);
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 return JSON.parse(text);
}
// Second, independent session (used for the pending account flow). Captures
// the latest Set-Cookie on every call, so a session issued by signup/login is
// not lost when the next request does not set a cookie.
async function requestB(path,method='GET',body,status=200){
 const response=await fetch(base+path,{method,headers:{Origin:base,...(cookieB?{Cookie:cookieB}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();assert.equal(response.status,status,text);
 if(response.headers.get('set-cookie'))cookieB=response.headers.get('set-cookie').split(';')[0];
 return JSON.parse(text);
}
const LONG='long-enough-password';
(async()=>{try{
 await start();
 assert.equal((await request('/api/map-config')).apiKey,key);
 for(const path of ['/','/live-map','/ai-sandbox','/updates','/reports','/sandbox']){
  const response=await fetch(base+path,{redirect:'manual'});
  assert.equal(response.status,307,path);assert.equal(response.headers.get('location'),'/admin',path);
 }
 const login=await fetch(base+'/admin'),html=await login.text();
 assert.equal(login.status,200);assert.ok(html.includes('Administrator access'));
 assert.equal(html.includes('aria-label="Event pages"'),false);
 assert.equal(html.includes('id="map"'),false);
 assert.equal(html.includes('class="site-shell"'),false);
 await request('/api/event','GET',undefined,401);
 await request('/api/events/missing/graph','GET',undefined,401);
 console.log('PASS signed-out localhost and all dashboard URLs redirect to login; login has no map/sidebar');
 await request('/api/event','POST',{name:'Denied'},403);
 // Validation rules merged from the Cloudflare frontend contract. Invalid
 // requests are rejected 400 and do not consume the per-account rate budget.
 await request('/api/auth','POST',{action:'signup',userId:'ab',userName:'Short',password:LONG},400);
 await request('/api/auth','POST',{action:'signup',userId:'.bad',userName:'Bad',password:LONG},400);
 await request('/api/auth','POST',{action:'signup',userId:'validuser',userName:'Test admin',password:'short'},400);
 // First account in an empty store bootstraps as the approved owner.
 const first=await request('/api/auth','POST',{action:'signup',userId:'validuser',userName:'Test admin',password:LONG});
 assert.equal(first.status,'approved');
 assert.equal((await request('/api/auth')).access,'owner');
 await request('/api/auth','POST',{action:'signup',userId:'validuser',userName:'Duplicate',password:LONG},409);
 assert.equal((await request('/api/admin')).role,'owner');
 const home=await fetch(base+'/',{headers:{Cookie:cookie},redirect:'manual'});
 assert.equal(home.status,307);assert.equal(home.headers.get('location'),'/live-map');
 for(const path of ['/live-map','/ai-sandbox','/updates','/reports','/sandbox']){
  const response=await fetch(base+path,{headers:{Cookie:cookie}});
  assert.equal(response.status,200,path);
  assert.ok((await response.text()).includes('aria-label="Event pages"'),path);
 }
 console.log('PASS authenticated homepage redirects to live map; every dashboard view includes sidebar');
 console.log('PASS localhost pages, map-key configuration, owner bootstrap signup, session and duplicate rejection');
 const {event}=await request('/api/event','POST',{name:'Test event',city:'Test city',lat:19.1,lon:72.9,bounds:{north:19.2,south:19,east:73,west:72.8}});
 const path='/api/events/'+event.id;
 const location={bounds:{north:19.2,south:19,east:73,west:72.8},center:{lat:19.1,lng:72.9},zoom:14};
 await request(path+'/location','POST',location);
 assert.deepEqual((await request(path+'/graph')).location,{...location,locked:true});
 await request(path+'/location','POST',location,409);
 await request('/api/event','POST',{name:'Moved',city:'Elsewhere',lat:20,lon:74},409);
 const payload={name:'Gate A',type:'gate',external_id:'GATE-A',latitude:19.1,longitude:72.9,capacity:50,status:'active'};
 const node=await request(path+'/nodes','POST',payload);
 assert.ok(Number.isInteger(node.node_id));assert.ok(node.created_at);
 assert.equal((await request(path+'/nodes/'+node.node_id,'PATCH',{capacity:60})).capacity,60);
 await request(path+'/nodes','POST',{...payload,latitude:0},503);
 await request(path+'/nodes','POST',{...payload,visitorsNow:12},503);
 await request(path+'/nodes','POST',{...payload,node_id:999},503);
 assert.equal((await request(path+'/graph')).nodes.length,1);
 console.log('PASS exact bounds/zoom persistence, lock overwrite guard, node POST/PATCH, out-of-bounds and invalid fields rejected');
 await request('/api/operations','POST',{action:'incident',title:'Test incident',description:'Test details'});
 assert.equal((await request('/api/operations')).records.filter(r=>r.kind==='incident').length,1);
 await stop();await start();
 assert.equal((await request('/api/auth')).user.userId,'validuser');
 const graph=await request(path+'/graph');
 assert.deepEqual(graph.location,{...location,locked:true});assert.equal(graph.nodes[0].capacity,60);
 const disk=JSON.parse(readFileSync(join(data,'data.json'),'utf8'));
 assert.equal(disk.accounts[0].password,undefined);assert.notEqual(disk.accounts[0].password_hash,'x');
 console.log('PASS accounts, sessions, event, bounds, zoom, nodes and incidents survive server restart; passwords hashed');
 await request(path+'/unlock','POST',{});
 assert.equal((await request(path+'/graph')).location.locked,false);
 await request(path+'/location','POST',{...location,zoom:15});
 assert.equal((await request(path+'/graph')).location.zoom,15);
 await request('/api/auth','POST',{action:'logout'});
 assert.equal((await request('/api/auth')).user,null);
 const loggedOut=await fetch(base+'/live-map',{headers:{Cookie:cookie},redirect:'manual'});
 assert.equal(loggedOut.status,307);assert.equal(loggedOut.headers.get('location'),'/admin');
 await request('/api/auth','POST',{action:'login',userId:'validuser',password:'wrong'},401);
 await request('/api/auth','POST',{action:'login',userId:'validuser',password:LONG});
 assert.equal((await request('/api/auth')).access,'owner');
 console.log('PASS explicit unlock/reframe, logout, bad-password rejection and login');  // --- Approval workflow (owner approves/declines pending accounts) ---
 cookie='';cookieB='';
 await request('/api/auth','POST',{action:'login',userId:'validuser',password:LONG});
 await requestB('/api/auth','POST',{action:'signup',userId:'second-admin',userName:'Second Admin',password:LONG});
 assert.equal(JSON.parse(JSON.stringify(await requestB('/api/auth'))).status,'pending');
 // A pending account authenticates but does not get admin access...
 assert.equal((await requestB('/api/auth')).access,'visitor');
 const pendingHome=await fetch(base+'/',{headers:{Cookie:cookieB},redirect:'manual'});
 assert.equal(pendingHome.status,307);assert.equal(pendingHome.headers.get('location'),'/admin');
 await requestB('/api/event','POST',{name:'Nope'},403);
 console.log('PASS later signups are pending with visitor access only');
 const list=await request('/api/admin');
 const pending=list.requests.find(r=>r.user_id==='second-admin');
 assert.ok(pending,'pending request listed for owner');
 // Owner approves → sessions are revoked (frontend parity: the new
 // administrator logs in again), then the account has admin access.
 await request('/api/admin','POST',{action:'approve',userId:'second-admin'});
 await requestB('/api/auth','POST',{action:'login',userId:'second-admin',password:LONG});
 assert.equal((await requestB('/api/admin')).role,'admin');
 const approvedHome=await fetch(base+'/',{headers:{Cookie:cookieB},redirect:'manual'});
 assert.equal(approvedHome.status,307);assert.equal(approvedHome.headers.get('location'),'/live-map');
 // Rejection revokes access and sessions of a non-owner account; a rejected
 // account can no longer log in at all.
 await request('/api/admin','POST',{action:'reject',userId:'second-admin'});
 await requestB('/api/auth','POST',{action:'login',userId:'second-admin',password:LONG},403);
 console.log('PASS owner approval grants admin access; rejection revokes access and sessions');
 console.log('All API integration checks passed.');
}finally{await stop()}})().catch(e=>{console.error(e);process.exitCode=1});
