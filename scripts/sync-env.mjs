#!/usr/bin/env node
// Single source of truth for API keys and service URLs: <repo root>/.env
//
//   npm run env:sync     (also runs automatically before `npm run dev` and `npm run test`)
//
// Shared keys that are set in the root .env are copied into the frontend's own env file:
//
//   .env (root)  ->  frontend-ideal/.env.local   read by next dev / next start
//
// The root Vite app already reads the root .env directly; anything it exposes to
// the browser must use the VITE_ prefix.
//
// Rules:
//   - only keys with a real (non-empty) value in the root .env are written; an
//     empty or missing key never overwrites a per-app local value,
//   - everything else in a target file (comments, app-specific settings) is kept,
//   - values are never printed, and both target files are git-ignored (.env*),
//     so nothing is committed and no secret leaks into logs or build output.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const root=fileURLToPath(new URL('../',import.meta.url));
const rootEnvFile=path.join(root,'.env');
const NOTICE='# Shared keys are synced from the repository root .env by `npm run env:sync` — set them there.';

// Keys that mean the same thing in every app. Add more here when needed.
const SHARED_KEYS=[
 'GOOGLE_MAPS_API_KEY',
 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
 'ORCHESTRATOR_URL',
 'ORCHESTRATOR_TOKEN',
 'EVENTFLOW_WS_URL',
 'TOMTOM_API_KEY',
 'EVENTFLOW_DATA_DIR',
];

const TARGETS=[
 {file:'frontend-ideal/.env.local',label:'frontend-ideal (Next.js)'},
];

// Values with spaces, quotes or '#' are written JSON-style, which dotenv parses.
const format=(key,value)=>`${key}=${/[\s#'"`]/.test(value)?JSON.stringify(value):value}`;

// Updates managed keys in place, appends new ones, and inserts the notice.
function merge(lines,values){
 const output=[];
 const pending=new Map(Object.entries(values));
 const updated=[];
 for(const line of lines){
  const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  const key=match?.[1];
  if(!key||!pending.has(key)){output.push(line);continue}
  const next=format(key,pending.get(key));
  pending.delete(key);
  if(line.trim()===next)output.push(line);
  else{output.push(next);updated.push(key)}
 }
 while(output.length&&output[output.length-1].trim()==='')output.pop();
 const added=[];
 if(pending.size){
  output.push('');
  for(const [key,value] of pending){output.push(format(key,value));added.push(key)}
 }
 if(output[0]!==NOTICE)output.unshift(NOTICE,'');
 return {text:`${output.join('\n')}\n`,added,updated};
}

function main(){
 if(!existsSync(rootEnvFile)){
  console.log('env:sync — no root .env found, nothing to sync.');
  console.log('  Create one from the template:  copy .env.example to .env and add your keys.');
  return;
 }
 const parsed=dotenv.parse(readFileSync(rootEnvFile,'utf8'));
 const values={};
 for(const key of SHARED_KEYS)if(parsed[key]&&parsed[key].trim())values[key]=parsed[key].trim();

 console.log('env:sync — shared keys from the root .env into each frontend:');
 console.log(`  set in .env: ${Object.keys(values).join(', ')||'(none yet)'}`);
 const unset=SHARED_KEYS.filter(key=>!(key in values));
 if(unset.length)console.log(`  not set (per-app values are left as they are): ${unset.join(', ')}`);

 for(const target of TARGETS){
  const file=path.join(root,target.file);
  const existing=existsSync(file)?readFileSync(file,'utf8'):null;
  if(existing===null&&Object.keys(values).length===0){
   console.log(`  ${target.file}  not created yet (nothing to sync)`);
   continue;
  }
  const result=merge(existing?existing.split(/\r?\n/):[],values);
  if(existing!==null&&result.text===existing){
   console.log(`  ${target.file}  unchanged`);
   continue;
  }
  writeFileSync(file,result.text);
  const changes=[...result.added.length?[`added ${result.added.join(', ')}`]:[],...result.updated.length?[`updated ${result.updated.join(', ')}`]:[]];
  console.log(`  ${target.file}  ${existing===null?'created':'written'}${changes.length?` · ${changes.join(' · ')}`:''}`);
 }
 console.log('  values are never printed; every target file is git-ignored (.env*).');
}

main();
