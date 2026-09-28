import {cookies} from 'next/headers';
import {sameOrigin} from '@/lib/request';
import {adminIdentity,cookieHeader,createSession,revokeSession,SESSION_COOKIE,passwordHash,newSalt,equalHash,USER_ID_PATTERN,MIN_PASSWORD_LENGTH,rateLimit,findAccount} from '@/lib/admin';
import {readStore,updateStore} from '@/lib/local-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){const i=await adminIdentity();return Response.json({user:i.user?{userId:i.user.user_id,userName:i.user.user_name,role:i.user.role,createdAt:i.user.created_at}:null,access:i.role,status:i.user?.status??null},{headers:{'Cache-Control':'no-store'}})}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403});
 try{
  const b=await req.json(),action=b.action;
  if(action==='logout'){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(token)revokeSession(token);return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader('',0)}})}
  const userId=typeof b.userId==='string'?b.userId.trim():'',password=typeof b.password==='string'?b.password:'';
  // Validation rules carried over from the Cloudflare frontend's functional contract.
  if(!['login','signup'].includes(action)||!userId||!password)return Response.json({error:'Enter a user ID and password.'},{status:400});
  if(userId.length>256||password.length>1024)return Response.json({error:'The entered value is too long.'},{status:400});
  if(!USER_ID_PATTERN.test(userId))return Response.json({error:'User IDs are 3-64 characters and may contain letters, numbers, dots, underscores and hyphens.'},{status:400});
  const name=typeof b.userName==='string'?b.userName.trim():'';
  // Validation happens BEFORE the rate limiter (frontend parity): invalid
  // requests are rejected 400 and never consume the attempt budget.
  if(action==='signup'&&(!name||name.length>100))return Response.json({error:'Enter your name.'},{status:400});
  if(action==='signup'&&password.length<MIN_PASSWORD_LENGTH)return Response.json({error:'Passwords need at least 12 characters.'},{status:400});
  // rateLimit returns true when the attempt is allowed (frontend semantics).
  if(!rateLimit('account:'+userId.toLowerCase()))return Response.json({error:'Too many attempts. Please try again in 15 minutes.'},{status:429});
  if(action==='signup'){
   // Name/password were validated above, before the rate limiter.
   const salt=newSalt(),hash=passwordHash(password,salt);
   // Approval workflow carried over from the frontend. Local bootstrap rule:
   // the FIRST account in an empty store becomes the approved owner (there is
   // no hosted identity header on the local Node server); every later signup
   // is created pending until the owner approves it in Administrator.
   const isFirstAccount=readStore().accounts.length===0;
   const exists=findAccount(userId);
   if(exists)return Response.json({error:'That user ID already exists. Log in instead.'},{status:409});
   updateStore(s=>{s.accounts.push({user_id:userId,user_name:name,role:'administrator',created_at:new Date().toISOString(),password_hash:hash,salt,status:isFirstAccount?'approved':'pending',is_owner:isFirstAccount?1:0})});
   const status=isFirstAccount?'approved':'pending';
   return Response.json({ok:true,status},{headers:{'Set-Cookie':cookieHeader(createSession(userId)),'Cache-Control':'no-store'}});
  }
  const account=findAccount(userId);
  const hash=passwordHash(password,account?.salt??'invalid-account');
  if(!account||!equalHash(hash,account.password_hash))return Response.json({error:'Invalid user ID or password.'},{status:401});
  if(account.status==='rejected')return Response.json({error:'This account does not have administrator access. Contact the owner.'},{status:403});
  return Response.json({ok:true,status:account.status},{headers:{'Set-Cookie':cookieHeader(createSession(userId)),'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not complete the request. Check the local server terminal.'},{status:500})}
}
