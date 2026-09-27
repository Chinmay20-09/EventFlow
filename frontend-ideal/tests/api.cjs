const {spawn}=require('node:child_process');
const {mkdtempSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),data=mkdtempSync(join(tmpdir(),'eventflow-api-test-'));
const base='http://127.0.0.1:4318';let server,cookie='',key='test-key-not-real';
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
 await request('/api/auth','POST',{action:'signup',userId:'a',userName:'Test admin',password:'x'});
 assert.equal((await request('/api/auth')).access,'admin');
 await request('/api/auth','POST',{action:'signup',userId:'a',userName:'Duplicate',password:'x'},409);
 assert.equal((await request('/api/admin')).role,'admin');
 const home=await fetch(base+'/',{headers:{Cookie:cookie},redirect:'manual'});
 assert.equal(home.status,307);assert.equal(home.headers.get('location'),'/live-map');
 for(const path of ['/live-map','/ai-sandbox','/updates','/reports','/sandbox']){
  const response=await fetch(base+path,{headers:{Cookie:cookie}});
  assert.equal(response.status,200,path);
  assert.ok((await response.text()).includes('aria-label="Event pages"'),path);
 }
 console.log('PASS authenticated homepage redirects to live map; every dashboard view includes sidebar');
 console.log('PASS localhost pages, map-key configuration, simple signup, session and duplicate rejection');
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
 assert.equal((await request('/api/auth')).user.userId,'a');
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
 await request('/api/auth','POST',{action:'login',userId:'a',password:'wrong'},401);
 await request('/api/auth','POST',{action:'login',userId:'a',password:'x'});
 assert.equal((await request('/api/auth')).access,'admin');
 console.log('PASS explicit unlock/reframe, logout, bad-password rejection and login');
 console.log('All API integration checks passed.');
}finally{await stop()}})().catch(e=>{console.error(e);process.exitCode=1});
