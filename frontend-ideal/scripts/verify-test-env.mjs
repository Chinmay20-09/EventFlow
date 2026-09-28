// Readiness + authentication verification against a running frontend-ideal server.
//
// Usage: node scripts/verify-test-env.mjs [--base http://127.0.0.1:3000] [--timeout 180000]
// Env:   TEST_ADMIN_USERNAME (default: admin), TEST_ADMIN_PASSWORD (default: admin123)
//
// Verifies the real running application: readiness, the signed-out login gate,
// API reachability, that the development administrator can log in and reach the
// administrator area, that unauthorized access is still rejected, and that
// logout still works. Exits non-zero when any check fails.
const argv=process.argv.slice(2);
const arg=(name,fallback)=>{const i=argv.indexOf(name);return i>=0&&argv[i+1]?argv[i+1]:fallback};
const origin=arg('--base',process.env.EVENTFLOW_TEST_URL||`http://127.0.0.1:${process.env.EVENTFLOW_TEST_PORT||3000}`).replace(/\/+$/,'');
const username=arg('--username',process.env.TEST_ADMIN_USERNAME||'admin');
const password=arg('--password',process.env.TEST_ADMIN_PASSWORD||'admin123');
const readyTimeout=Number(arg('--timeout',180000));
const SESSION_COOKIE='eventflow_local_session';

console.log(`Verifying the local test environment at ${origin} (administrator "${username}").`);
let cookie='';
const results=[];
async function step(name,run){try{await run();results.push({name,ok:true});console.log(`  PASS  ${name}`)}catch(error){results.push({name,ok:false,error});console.error(`  FAIL  ${name}\n          ${error.message}`)}}
function assert(condition,message){if(!condition)throw new Error(message)}
async function request(path,{method='GET',body,useCookie=true,timeout=60000}={}){
 const headers={Origin:origin};
 if(useCookie&&cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(timeout)});
 const text=await response.text();
 const setCookies=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
 return {status:response.status,location:response.headers.get('location'),setCookies,text,json(){try{return JSON.parse(text)}catch{return null}}};
}
// The server sets a session cookie on login/signup and an expired one on logout.
function captureCookie(response){for(const value of response.setCookies){if(value.startsWith(SESSION_COOKIE+'='))cookie=value.split(';')[0]}}

async function main(){
 await step('server is ready and accepting requests',async()=>{
  const started=Date.now();
  for(;;){
   try{const response=await request('/api/auth',{useCookie:false,timeout:5000});if(response.status===200&&typeof response.json()?.access==='string')return}catch{}
   if(Date.now()-started>readyTimeout)throw new Error(`no healthy response from ${origin}/api/auth within ${readyTimeout}ms`);
   await new Promise(resolve=>setTimeout(resolve,500));
  }
 });

 await step('signed-out visitors get the login page (no app content)',async()=>{
  const home=await request('/',{useCookie:false});
  assert(home.status===307,`GET / expected 307, got ${home.status}`);
  assert(home.location==='/admin',`GET / expected redirect to /admin, got ${home.location}`);
  const admin=await request('/admin',{useCookie:false});
  assert(admin.status===200,`GET /admin expected 200, got ${admin.status}`);
  assert(admin.text.includes('Administrator access'),'GET /admin did not render the administrator login screen');
 });

 await step('frontend API routes are reachable',async()=>{
  const auth=await request('/api/auth',{useCookie:false});
  assert(auth.status===200,`GET /api/auth expected 200, got ${auth.status}`);
  assert(auth.json()?.user===null,'GET /api/auth should report no signed-in user');
  const map=await request('/api/map-config',{useCookie:false});
  assert(map.status===200,`GET /api/map-config expected 200, got ${map.status}`);
  assert(map.json()!==null&&'apiKey' in map.json(),'GET /api/map-config did not return a configuration document');
 });

 await step('unauthorized access is still rejected',async()=>{
  const event=await request('/api/event',{useCookie:false});
  assert(event.status===401,`GET /api/event expected 401, got ${event.status}`);
  const write=await request('/api/event',{method:'POST',body:{name:'Denied'},useCookie:false});
  assert(write.status===403,`POST /api/event expected 403, got ${write.status}`);
  const adminApi=await request('/api/admin',{useCookie:false});
  assert(adminApi.status===401,`GET /api/admin expected 401, got ${adminApi.status}`);
  const page=await request('/live-map',{useCookie:false});
  assert(page.status===307&&page.location==='/admin',`GET /live-map expected 307 to /admin, got ${page.status} ${page.location}`);
 });

 await step(`administrator credentials "${username}" are accepted (login)`,async()=>{
  const login=await request('/api/auth',{method:'POST',body:{action:'login',userId:username,password},useCookie:false});
  assert(login.status===200,`POST /api/auth login expected 200, got ${login.status}: ${login.text}`);
  assert(login.json()?.ok===true,'login did not report success');
  captureCookie(login);
  assert(cookie.length>SESSION_COOKIE.length+1,'login did not issue a session cookie');
 });

 await step('the session is recognised as an approved administrator',async()=>{
  const identity=await request('/api/auth');
  assert(identity.status===200,`GET /api/auth expected 200, got ${identity.status}`);
  const user=identity.json()?.user;
  assert(user&&user.userId.toLowerCase()===username.toLowerCase(),`signed-in user is ${user?user.userId:'none'}, expected ${username}`);
  assert(user.role==='administrator',`expected the administrator role, got ${user.role}`);
  assert(['admin','owner'].includes(identity.json()?.access),`expected admin/owner access, got ${identity.json()?.access}`);
 });

 await step('the authenticated application and admin area are accessible',async()=>{
  const adminApi=await request('/api/admin');
  assert(adminApi.status===200,`GET /api/admin expected 200, got ${adminApi.status}`);
  assert(['admin','owner'].includes(adminApi.json()?.role),`GET /api/admin returned role ${adminApi.json()?.role}`);
  const adminPage=await request('/admin');
  assert(adminPage.status===200,`GET /admin expected 200 when signed in, got ${adminPage.status}`);
  const home=await request('/');
  assert(home.status===307&&home.location==='/live-map',`GET / expected 307 to /live-map, got ${home.status} ${home.location}`);
  const liveMap=await request('/live-map');
  assert(liveMap.status===200,`GET /live-map expected 200, got ${liveMap.status}`);
  assert(liveMap.text.includes('aria-label="Event pages"'),'GET /live-map did not render the authenticated dashboard shell');
 });

 await step('a wrong password is rejected',async()=>{
  const denied=await request('/api/auth',{method:'POST',body:{action:'login',userId:username,password:password+'-wrong'},useCookie:false});
  assert(denied.status===401,`expected 401 for a wrong password, got ${denied.status}`);
 });

 await step('logout still works',async()=>{
  const logout=await request('/api/auth',{method:'POST',body:{action:'logout'}});
  assert(logout.status===200,`POST /api/auth logout expected 200, got ${logout.status}`);
  captureCookie(logout);
  const identity=await request('/api/auth');
  assert(identity.json()?.user===null,'the session survived logout');
  const page=await request('/live-map');
  assert(page.status===307&&page.location==='/admin',`GET /live-map after logout expected 307 to /admin, got ${page.status} ${page.location}`);
 });

 const failed=results.filter(result=>!result.ok);
 console.log(`\n${results.length-failed.length}/${results.length} readiness and authentication checks passed.`);
 if(failed.length){
  console.error(`Failing checks: ${failed.map(result=>result.name).join('; ')}`);
  process.exit(1);
 }
 console.log('Local test environment verified: frontend, API and the administrator login flow all work.');
}
await main();
