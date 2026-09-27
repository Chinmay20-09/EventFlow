import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readStore,updateStore} from './local-store';

export const SESSION_COOKIE='eventflow_local_session';
export const SESSION_SECONDS=43200;
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const newSalt=()=>randomBytes(16).toString('hex');
export const passwordHash=(password:string,salt:string)=>scryptSync(password,salt,64).toString('hex');
export function equalHash(a:string,b:string){const left=Buffer.from(a,'hex'),right=Buffer.from(b,'hex');return left.length===right.length&&timingSafeEqual(left,right)}
export function cookieHeader(token:string,maxAge=SESSION_SECONDS){return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`}
export async function adminIdentity(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 const state=readStore(),session=token?state.sessions.find(s=>s.hash===digest(token)&&s.expiresAt>Date.now()):null;
 const user=session?state.accounts.find(u=>u.user_id===session.userId):null;
 return {user:user??null,role:user?'admin':'anonymous',request:null};
}
export function createSession(userId:string){
 const token=randomBytes(32).toString('hex');
 updateStore(s=>{s.sessions=s.sessions.filter(x=>x.expiresAt>Date.now());s.sessions.push({hash:digest(token),userId,expiresAt:Date.now()+SESSION_SECONDS*1000})});
 return token;
}
export function revokeSession(token:string){updateStore(s=>{s.sessions=s.sessions.filter(x=>x.hash!==digest(token))})}
export async function requireAdministrator(){
 const identity=await adminIdentity();
 if(!identity.user)redirect('/admin');
 return identity.user;
}
