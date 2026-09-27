import {sameOrigin} from '@/lib/request';
import {adminIdentity,cookieHeader,createSession,revokeSession,SESSION_COOKIE,passwordHash,newSalt,equalHash} from '@/lib/admin';
import {readStore,updateStore} from '@/lib/local-store';
import {cookies} from 'next/headers';
export const runtime='nodejs';
export async function GET(){const i=await adminIdentity();return Response.json({user:i.user?{userId:i.user.user_id,userName:i.user.user_name,role:i.user.role,createdAt:i.user.created_at}:null,access:i.role,status:i.user?.status??null},{headers:{'Cache-Control':'no-store'}})}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403});
 try{
  const b=await req.json(),action=b.action;
  if(action==='logout'){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(token)revokeSession(token);return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader('',0)}})}
  const userId=typeof b.userId==='string'?b.userId.trim():'',password=typeof b.password==='string'?b.password:'';
  if(!['login','signup'].includes(action)||!userId||!password)return Response.json({error:'Enter a user ID and password.'},{status:400});
  if(userId.length>256||password.length>1024)return Response.json({error:'The entered value is too long.'},{status:400});
  if(action==='signup'){
   const name=typeof b.userName==='string'?b.userName.trim():'';
   if(!name)return Response.json({error:'Enter your name.'},{status:400});
   const salt=newSalt(),hash=passwordHash(password,salt);
   const added=updateStore(s=>{if(s.accounts.some(u=>u.user_id===userId))return false;s.accounts.push({user_id:userId,user_name:name,role:'administrator',created_at:new Date().toISOString(),password_hash:hash,salt,status:'approved',is_owner:0});return true});
   if(!added)return Response.json({error:'That user ID already exists. Log in instead.'},{status:409});
  }else{
   const account=readStore().accounts.find(u=>u.user_id===userId);
   const hash=passwordHash(password,account?.salt??'invalid-account');
   if(!account||!equalHash(hash,account.password_hash))return Response.json({error:'Invalid user ID or password.'},{status:401});
  }
  return Response.json({ok:true,status:'approved'},{headers:{'Set-Cookie':cookieHeader(createSession(userId)),'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not complete the request. Check the local server terminal.'},{status:500})}
}
