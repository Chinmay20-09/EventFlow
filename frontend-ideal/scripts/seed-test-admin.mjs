// Development-only seed for the local test administrator account.
//
// Reuses the application's own account model (lib/local-store.ts) and password
// hashing (lib/credentials.ts) — it does not invent a parallel auth system and
// never touches production: it refuses to run when NODE_ENV=production and only
// ever writes the local JSON store.
//
// Idempotent: running `npm run test` repeatedly updates the same account
// instead of creating duplicates, and clears the account's rate-limit window so
// the account stays usable on every run.
//
// Username/password come from TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD with
// local development defaults. The password is never printed or logged.
import {readStore,updateStore} from '../lib/local-store.ts';
import {newSalt,passwordHash,USER_ID_PATTERN} from '../lib/credentials.ts';

const username=(process.env.TEST_ADMIN_USERNAME||'admin').trim();
const password=process.env.TEST_ADMIN_PASSWORD||'admin123';

if(process.env.NODE_ENV==='production'){
  console.error('seed-test-admin: refusing to run with NODE_ENV=production. This seed is for local development/testing only.');
  process.exit(1);
}
if(!USER_ID_PATTERN.test(username)){
  console.error('seed-test-admin: TEST_ADMIN_USERNAME must be 3-64 characters: letters, numbers, dots, underscores, hyphens.');
  process.exit(1);
}
if(password.length<6){
  console.error('seed-test-admin: TEST_ADMIN_PASSWORD must be at least 6 characters.');
  process.exit(1);
}

const key=username.toLowerCase();
const result=updateStore(state=>{
  // Another account already owns this store: promote/keep this one as a normal
  // approved administrator rather than fighting over ownership.
  const ownerTaken=state.accounts.some(a=>a.is_owner===1&&a.user_id.toLowerCase()!==key);
  const salt=newSalt(),hash=passwordHash(password,salt);
  // Failed login attempts from earlier runs must not lock the dev account out
  // (the app's own per-account rate limiter is untouched; only this window is reset).
  state.rateLimits=(state.rateLimits??[]).filter(r=>r.key!=='account:'+key);
  const account=state.accounts.find(a=>a.user_id.toLowerCase()===key);
  const isOwner=ownerTaken?0:1;
  if(account){
    account.user_name=account.user_name||'Local test administrator';
    account.role='administrator';
    account.status='approved';
    account.is_owner=isOwner;
    account.password_hash=hash;
    account.salt=salt;
    return {action:'updated',userId:account.user_id,isOwner};
  }
  state.accounts.push({user_id:username,user_name:'Local test administrator',role:'administrator',created_at:new Date().toISOString(),password_hash:hash,salt,status:'approved',is_owner:isOwner});
  return {action:'created',userId:username,isOwner};
});

const account=readStore().accounts.find(a=>a.user_id.toLowerCase()===key);
console.log(`seed-test-admin: ${result.action} local ${result.isOwner?'owner':'administrator'} "${account.user_id}" (role: ${account.role}, status: ${account.status}, store: ${process.cwd()}/.eventflow-local).`);
console.log('seed-test-admin: password is TEST_ADMIN_PASSWORD (local development default only) — never logged.');
