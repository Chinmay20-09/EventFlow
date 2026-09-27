import {redirect} from 'next/navigation';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {updateStore} from './local-store';

export const SESSION_COOKIE='eventflow_local_session';
export const SESSION_SECONDS=43200;
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const newSalt=()=>randomBytes(16).toString('hex');
export const passwordHash=(password:string,salt:string)=>scryptSync(password,salt,64).toString('hex');
export function equalHash(a:string,b:string){const left=Buffer.from(a,'hex'),right=Buffer.from(b,'hex');return left.length===right.length&&timingSafeEqual(left,right)}
export function cookieHeader(token:string,maxAge=SESSION_SECONDS){return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`}
// Auth removed for local development: every visitor is treated as an approved
// local administrator, so the app opens directly on the home (live map) screen.
const LOCAL_USER={user_id:'local-admin',user_name:'Local Administrator',role:'administrator' as const,created_at:new Date().toISOString(),password_hash:'',salt:'',status:'approved' as const,is_owner:1};
export async function adminIdentity(){
 return {user:LOCAL_USER,role:'admin',request:null};
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
