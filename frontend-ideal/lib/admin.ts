import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {randomBytes} from 'node:crypto';
import {readStore,updateStore} from './local-store';
import {digest,newSalt,passwordHash,equalHash,MIN_PASSWORD_LENGTH,USER_ID_PATTERN} from './credentials';

export const SESSION_COOKIE='eventflow_local_session';
export const SESSION_SECONDS=43200;
// Credential rules and password hashing live in lib/credentials.ts (no Next.js
// imports) so the local development seed reuses the identical implementation.
export {digest,newSalt,passwordHash,equalHash,MIN_PASSWORD_LENGTH,USER_ID_PATTERN};
export function cookieHeader(token:string,maxAge=SESSION_SECONDS){return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`}
// Rate limiting mirrors the frontend's per-account window semantics on the
// local store (15-minute window, frontend allows 8 attempts per account).
export const RATE_WINDOW_MS=15*60*1000, RATE_LIMIT_ATTEMPTS=8;
export function rateLimit(key:string,limit=RATE_LIMIT_ATTEMPTS){return updateStore(state=>{
 const now=Date.now();
 state.rateLimits=state.rateLimits??[];
 let entry=state.rateLimits.find(r=>r.key===key);
 if(!entry){entry={key,attempts:0,resetAt:now+RATE_WINDOW_MS};state.rateLimits.push(entry)}
 if(entry.resetAt<=now){entry.attempts=0;entry.resetAt=now+RATE_WINDOW_MS}
 entry.attempts++;
 return entry.attempts<=limit;
})}
export function findAccount(userId:string){return readStore().accounts.find(u=>u.user_id.toLowerCase()===userId.toLowerCase())}
// Identity resolution mirrors the frontend's role model: `owner` (bootstrap
// account) > `admin` (approved administrator) > `visitor` (pending/rejected).
export async function adminIdentity(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 const state=readStore(),session=token?state.sessions.find(s=>s.hash===digest(token)&&s.expiresAt>Date.now()):null;
 const user=session?state.accounts.find(u=>u.user_id===session.userId):null;
 if(!user)return {user:null,role:'anonymous' as const,request:null as null};
 if(user.status!=='approved')return {user,role:'visitor' as const,request:{status:user.status} as {status:string}|null};
 return {user,role:user.is_owner?('owner' as const):('admin' as const),request:null as null};
}
export function createSession(userId:string){
 const token=randomBytes(32).toString('hex');
 updateStore(s=>{s.sessions=s.sessions.filter(x=>x.expiresAt>Date.now());s.sessions.push({hash:digest(token),userId,expiresAt:Date.now()+SESSION_SECONDS*1000})});
 return token;
}
export function revokeSession(token:string){updateStore(s=>{s.sessions=s.sessions.filter(x=>x.hash!==digest(token))})}
// Revokes every session of a non-owner account (used when access is revoked).
export function revokeUserSessions(userId:string){updateStore(s=>{const target=s.accounts.find(u=>u.user_id===userId);if(target?.is_owner)return;s.sessions=s.sessions.filter(x=>x.userId!==userId)})}
export async function requireAdministrator(){
 const identity=await adminIdentity();
 // Pending/rejected accounts authenticate but hold no administrator access.
 if(!identity.user||identity.role==='visitor')redirect('/admin');
 return identity.user;
}

