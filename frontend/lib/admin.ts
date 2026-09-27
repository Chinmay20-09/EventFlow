import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
export const SESSION_COOKIE='__Host-eventflow_session';
export const PASSWORD_ITERATIONS=100000;
export const SESSION_SECONDS=43200;
export function database(){const db=(env as unknown as {DB?:D1Database}).DB;if(!db)throw Error('Account service is temporarily unavailable. Please try again.');return db}
export function hex(bytes:ArrayBuffer|Uint8Array){return Array.from(new Uint8Array(bytes instanceof Uint8Array?bytes.buffer:bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function digest(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
export async function passwordHash(password:string,salt:string,iterations=PASSWORD_ITERATIONS){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations,hash:'SHA-256'},key,256))}
export function equalHash(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export function cookieHeader(token:string,maxAge=SESSION_SECONDS){return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`}
export async function adminIdentity(){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return {user:null,role:'anonymous',request:null};const user=await database().prepare('SELECT u.user_id,u.user_name,u.role,u.created_at,u.status,u.is_owner FROM credential_sessions s JOIN credential_users u ON u.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first<any>();if(!user)return {user:null,role:'anonymous',request:null};return {user,role:user.status==='approved'?(user.is_owner?'owner':'admin'):'visitor',request:user.status==='approved'?null:{status:user.status}}}
export async function createSession(userId:string){const token=hex(crypto.getRandomValues(new Uint8Array(32)));await database().prepare('INSERT INTO credential_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),userId,Date.now()+SESSION_SECONDS*1000).run();return token}
export async function rateLimit(key:string,limit:number){const row=await database().prepare('INSERT INTO auth_rate_limits (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING attempts').bind(key,Date.now()+900000,Date.now(),Date.now()).first<any>();return row.attempts<=limit}
