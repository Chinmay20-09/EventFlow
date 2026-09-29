#!/usr/bin/env node
// `npm run test` — the single command that launches and verifies frontend-ideal.
//
//   seed the local test administrator (development only, idempotent)
//     -> start (or reuse) frontend-ideal on http://127.0.0.1:3000
//       -> wait for real readiness (polling the app, never a sleep)
//         -> verify frontend, API, admin login, authorization and logout
//           -> run the repository's existing automated tests
//             -> leave the app running so you can open the printed URL
//
// Flags:
//   --foreground   run the server in this terminal (Ctrl+C stops it)
//   --fast         skip the frontend-ideal API integration suite
//   --no-keep      stop the server this command started when it finishes
//   --restart      restart the dev server even if one is already running
//   --port <n>     preferred port (default 3000; the next free port is used if busy)
//   --stop         stop the running frontend-ideal dev server and exit
//
// frontend-ideal is self-contained: its backend is its own Next.js route
// handlers plus the local JSON store.
import {spawn,spawnSync} from 'node:child_process';
import {closeSync,existsSync,mkdirSync,openSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const ideal=path.join(root,'frontend-ideal');
const stateDir=path.join(ideal,'.eventflow-local');
const stateFile=path.join(stateDir,'test-server.json');
const logFile=path.join(stateDir,'test-server.log');
const nextBin=path.join(ideal,'node_modules','next','dist','bin','next');
const nextLockFile=path.join(ideal,'.next','dev','lock');
const nextDevDir=path.join(ideal,'.next','dev');
const nextDevLog=path.join(nextDevDir,'logs','next-development.log');
const npmCli=process.env.npm_execpath&&existsSync(process.env.npm_execpath)?process.env.npm_execpath:null;
const argv=process.argv.slice(2);
const flag=name=>argv.includes(name);
const portArg=argv.indexOf('--port')>=0?argv[argv.indexOf('--port')+1]:undefined;
const foreground=flag('--foreground');

// Local development credentials (development defaults only; never used in production).
const testUser=process.env.TEST_ADMIN_USERNAME||'admin';
const testPassword=process.env.TEST_ADMIN_PASSWORD||'admin123';
const keepAlive=!flag('--no-keep')&&!foreground&&process.env.CI!=='true';
const keepServer=keepAlive||foreground;
const steps=[];
let requestedStop=false;
let spawnedHere=false;

function record(label,ok,detail){steps.push({label,ok,detail});return ok}
function fail(message){console.error(`\nFAILED: ${message}`);process.exit(1)}
function readJson(file){try{return JSON.parse(readFileSync(file,'utf8'))}catch{return null}}
function isAlive(pid){if(!pid)return false;try{process.kill(pid,0);return true}catch{return false}}
function stopPid(pid){
 requestedStop=true;
 if(!isAlive(pid))return false;
 if(process.platform==='win32')spawnSync('taskkill',['/pid',String(pid),'/t','/f'],{stdio:'ignore'});
 else{try{process.kill(-pid,'SIGTERM')}catch{try{process.kill(pid,'SIGTERM')}catch{}}}
 return true;
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function portFree(port){return new Promise(resolve=>{
 const socket=createConnection({host:'127.0.0.1',port});let settled=false;
 const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value)};
 socket.once('connect',()=>finish(false));socket.once('error',()=>finish(true));socket.setTimeout(1000,()=>finish(false));
})}
// A server counts as ready only when this application answers on its own API.
async function healthy(url,timeout=3000){
 try{
  const response=await fetch(url+'/api/auth',{headers:{'Cache-Control':'no-store'},signal:AbortSignal.timeout(timeout)});
  if(!response.ok)return false;
  const body=await response.json().catch(()=>null);
  return !!body&&typeof body.access==='string';
 }catch{return false}
}
async function reachable(...candidates){
 for(const candidate of candidates.filter(Boolean))if(await healthy(candidate))return candidate;
 return null;
}
// Next.js records the running dev server for this directory in .next/dev/lock.
function devLock(){const lock=readJson(nextLockFile);return lock&&isAlive(lock.pid)?lock:null}
// Last resort for a dev server started outside this command (for example one
// left behind when an earlier run was interrupted): ask the OS who listens there.
function pidOnPort(port){
 const windows=process.platform==='win32';
 const result=spawnSync(windows?'netstat':'lsof',windows?['-ano']:['-ti',`tcp:${port}`],{encoding:'utf8'});
 if(!result.stdout)return null;
 if(windows){
  const line=result.stdout.split(/\r?\n/).find(entry=>/LISTENING/.test(entry)&&new RegExp(`[:.]${port}[^0-9]`).test(entry));
  const pid=line?line.trim().split(/\s+/).pop():null;
  return pid&&Number(pid)>0?Number(pid):null;
 }
 const pid=result.stdout.split(/\s+/).find(Boolean);
 return pid&&Number(pid)>0?Number(pid):null;
}
function logTail(lines=30){for(const file of [logFile,nextDevLog]){try{return `${path.relative(root,file)}:\n${readFileSync(file,'utf8').split(/\r?\n/).slice(-lines).join('\n')}`}catch{}}return '(no server log yet)'}
// Runs an existing project command and records the result; output stays visible.
function suite(label,args,{cwd=root,timeout=600000}={}){
 const started=Date.now();
 const result=npmCli
  ?spawnSync(process.execPath,[npmCli,...args],{cwd,stdio:'inherit',windowsHide:true,timeout})
  :spawnSync(`npm ${args.join(' ')}`,{cwd,stdio:'inherit',shell:true,windowsHide:true,timeout});
 const seconds=((Date.now()-started)/1000).toFixed(1);
 return record(label,result.status===0,result.status===0?`${seconds}s`:`exit code ${result.status??'timeout'} (${seconds}s)`);
}

// Starts the dev server and waits until the application answers (real readiness).
async function startServer({port,clean=false}){
 if(clean){
  console.log('• Clearing the stale Next.js dev build (.next/dev) before restarting…');
  rmSync(nextDevDir,{recursive:true,force:true});
 }
 const url=`http://127.0.0.1:${port}`;
 console.log(`• Starting frontend-ideal on ${url} (dev server, log: ${path.relative(root,logFile)})…`);
 const log=openSync(logFile,'w');
 const child=spawn(process.execPath,[nextBin,'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{
  cwd:ideal,detached:!foreground,windowsHide:true,
  stdio:foreground?['ignore','pipe','pipe']:['ignore',log,log],
 });
 if(foreground){
  spawnedHere=true;
  child.stdout.on('data',chunk=>process.stdout.write(chunk));
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.on('exit',(code,signal)=>{rmSync(stateFile,{force:true});console.error(`\nfrontend-ideal exited (${signal??code??'unknown'}).`);process.exit(code??1)});
 }else{
  closeSync(log);
  child.unref();
  // The app must stay up; if it dies on its own, say so instead of reporting
  // mysterious connection errors later.
  child.on('exit',(code,signal)=>{if(!requestedStop)console.error(`\n[frontend-ideal] the dev server exited on its own (pid ${child.pid}, code ${code}, signal ${signal}). See: ${path.relative(root,logFile)}`)});
 }
 child.on('error',error=>{rmSync(stateFile,{force:true});console.error(`\nfrontend-ideal could not start: ${error.message}`);process.exit(1)});
 const state={pid:child.pid,port,url,managed:true,startedAt:new Date().toISOString(),log:path.relative(root,logFile)};
 writeFileSync(stateFile,JSON.stringify(state,null,2));
 console.log('• Waiting for the server to become ready…');
 const started=Date.now(),timeoutMs=240000;
 let ready=false,dots=0;
 while(Date.now()-started<timeoutMs){
  if(await healthy(state.url)){ready=true;break}
  if(!foreground&&!isAlive(child.pid))break;
  if(Date.now()-started>dots*2000){process.stdout.write('.');dots++}
  await sleep(500);
 }
 if(!ready){
  if(!foreground)stopPid(state.pid);
  throw new Error(`frontend-ideal did not become ready within ${timeoutMs/1000}s.\nLast server log lines:\n${logTail()}`);
 }
 console.log(`\n• Ready after ${((Date.now()-started)/1000).toFixed(1)}s`);
 activeServer=state;
 return state;
}

// Another dev server for this directory must be gone before Next.js will start
// a new one — the API integration suite leaves one shutting down behind.
async function clearDevServerHolder(why){
 const holder=devLock();
 if(!holder)return;
 console.log(`• ${why} (pid ${holder.pid} on port ${holder.port})…`);
 stopPid(holder.pid);
 const started=Date.now();
 while(Date.now()-started<15000&&devLock())await sleep(300);
 await sleep(300);
}

// Waiting again matters after the env sync: a dev server reloads when its env
// file changes, and this keeps the verification from racing that reload.
async function waitReady(state,timeout=120000){
 if(await healthy(state.url))return true;
 console.log('• Waiting for frontend-ideal to finish reloading…');
 const started=Date.now();
 while(Date.now()-started<timeout){if(await healthy(state.url))return true;await sleep(500)}
 return false;
}

// Verifies the running application once and records the result.
function verify(state,label='readiness · API · admin login · authorization · logout'){
 console.log('\nVerifying the running application:');
 return suite(label,['run','verify:test-env','--','--base',state.url],{cwd:ideal,timeout:300000});
}

let activeServer=null;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(activeServer&&keepServer&&!requestedStop)
  console.error(`\nInterrupted — frontend-ideal is still running at ${activeServer.url} (stop it with: npm run test:stop)`);
 process.exit(130);
});

async function main(){
 console.log('\nEventFlow — npm run test · frontend-ideal local test environment\n');
 if(!existsSync(nextBin))fail('frontend-ideal dependencies are missing. Run: cd frontend-ideal && npm install');
 mkdirSync(stateDir,{recursive:true});

 // An already running dev server for this directory (started by an earlier run
 // or manually with `npm run dev`) is reused instead of racing a second one.
 const previous=readJson(stateFile);
 const lock=devLock();
 const preferredPort=Number(portArg||process.env.EVENTFLOW_TEST_PORT||3000);
 let running=null;
 if(previous&&isAlive(previous.pid)){
  const url=await reachable(previous.url,`http://127.0.0.1:${previous.port}`);
  if(url)running={pid:previous.pid,port:previous.port,url,managed:true,log:previous.log};
 }
 if(!running&&lock){
  const url=await reachable(`http://127.0.0.1:${lock.port}`,lock.appUrl);
  if(url)running={pid:lock.pid,port:lock.port,url,managed:false};
 }
 if(!running){
  // Anything already answering as this app on the expected port is used, even
  // when no run state or dev lock is left to identify it.
  const url=await reachable(`http://127.0.0.1:${preferredPort}`);
  if(url)running={pid:pidOnPort(preferredPort),port:preferredPort,url,managed:false};
 }

 if(flag('--stop')){
  if(!running){rmSync(stateFile,{force:true});console.log('No running frontend-ideal dev server was found.');return}
  const pid=running.pid||pidOnPort(running.port);
  rmSync(stateFile,{force:true});
  if(!pid){
   console.log(`A frontend-ideal dev server is answering on ${running.url}, but its process could not be identified here.`);
   console.log('Stop it in the terminal where it was started (Ctrl+C).');
   return;
  }
  console.log(`Stopping frontend-ideal (pid ${pid}) on ${running.url}…`);
  stopPid(pid);
  console.log('Stopped.');
  return;
 }

 // 1. Shared API keys from the repository root .env (empty root keys never overwrite a local value).
 console.log('• Syncing shared keys from the root .env into the frontend env files…');
 suite('sync root .env into frontend env files',['run','env:sync']);

 // 2. Development-only test administrator (idempotent; reuses the app's own store and scrypt hashing).
 console.log('• Preparing the local test administrator…');
 if(!suite('seed local test administrator',['run','seed:test-admin'],{cwd:ideal,timeout:120000}))
  fail('the local test administrator could not be prepared (see the seed output above)');

 // 3. The existing API integration suite boots its own dev server for this
 //    directory, so it can only run while no other frontend-ideal dev server is up.
 if(flag('--fast'))console.log('• Skipping the frontend-ideal API integration suite (--fast).');
 else if(running)console.log(`• Skipping the frontend-ideal API integration suite: a dev server is already running for this directory (${running.url}).`);
 else{
  console.log('• Running the frontend-ideal API integration suite (it starts and stops its own dev server)…');
  suite('frontend-ideal API integration suite',['run','test:api','--','--dev'],{cwd:ideal,timeout:600000});
 }

 // 4. Reuse a running server, or start a fresh one.
 if(running&&flag('--restart')){
  console.log(`• --restart: stopping the frontend-ideal server on ${running.url} (pid ${running.pid})…`);
  stopPid(running.pid);rmSync(stateFile,{force:true});running=null;
 }
 let state;
 if(running){
  state=running;
  activeServer=state;
  console.log(`• Reusing the frontend-ideal dev server already running at ${state.url} (pid ${state.pid||'unknown'}${state.managed?'':' — started outside npm run test'})`);
 }else{
  await clearDevServerHolder('A frontend-ideal dev server from an earlier run is still holding this directory — stopping it first');
  let port=null;
  for(let candidate=preferredPort;candidate<preferredPort+20;candidate++){if(await portFree(candidate)){port=candidate;break}}
  if(!port)fail(`no free port between ${preferredPort} and ${preferredPort+19} — set EVENTFLOW_TEST_PORT or pass --port`);
  try{
   state=await startServer({port});
  }catch(error){
   // A dev server that refuses to start (e.g. one shutting down still holds the
   // Next.js dev lock) is cleared away and started once more, cleanly.
   console.error(`\n• ${error.message}`);
   console.error('• Recovering: stopping any dev server for this directory and clearing the dev build…');
   await clearDevServerHolder('Stopping the blocking dev server');
   state=await startServer({port,clean:true});
  }
 }

 // 5. Verify the running application; a dev server that dies (e.g. a stale
 //    build left by another dev server) is restarted and verified once more.
 await waitReady(state);
 let verificationOk=verify(state);
 if(!verificationOk&&!foreground){
  console.error('\n• The verification did not complete. Restarting frontend-ideal with a clean dev build and retrying once…');
  steps.pop();
  stopPid(state.pid);
  await sleep(1000);
  state=await startServer({port:state.port,clean:true});
  verificationOk=verify(state,'retry: readiness · API · admin login · authorization · logout');
 }

 // 6. The repository's remaining automated tests.
 console.log("\nRunning the repository's existing automated tests:");
 suite('root suite (vitest)',['run','test:unit']);
 suite('frontend-ideal unit tests',['test'],{cwd:ideal,timeout:300000});

 // 7. Report and leave the app available for manual testing.
 const failed=steps.filter(step=>!step.ok);
 console.log('\n──────── npm run test summary ────────');
 for(const step of steps)console.log(`  ${step.ok?'PASS':'FAIL'}  ${step.label}${step.detail?`  (${step.detail})`:''}`);
 if(failed.length){
  console.error(`\n${failed.length} of ${steps.length} checks failed. Fix the failures above and run npm run test again.`);
  console.error(`Server log: ${state.log||path.relative(root,nextDevLog)}`);
  if(keepServer)console.error(`frontend-ideal is still running for inspection at ${state.url} (stop it with: npm run test:stop)`);
  else stopPid(state.pid);
  process.exit(1);
 }
 console.log(`\nAll ${steps.length} checks passed.`);
 console.log(`frontend-ideal is running at ${state.url} and authentication is real (local JSON store, scrypt hashes, session cookie).`);
 console.log(`  Login      ${testUser} / ${testPassword}   (local development account only — approve or create more users in /admin)`);
 console.log(`  Server log ${state.log||path.relative(root,nextDevLog)}`);
 if(spawnedHere&&foreground)console.log('  Stop it    Ctrl+C in this terminal\n');
 else if(keepServer)console.log('  Stop it    npm run test:stop\n');
 else{stopPid(state.pid);console.log('  (server stopped: --no-keep / CI)\n')}
 console.log('Open the URL above to use the application.\n');
 if(spawnedHere&&foreground){console.log('frontend-ideal is attached to this terminal — press Ctrl+C to stop it.');await new Promise(()=>{})}
}

await main().catch(error=>{console.error(error);process.exit(1)});
