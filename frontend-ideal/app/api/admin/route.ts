import {sameOrigin} from '@/lib/request';
import {adminIdentity,revokeUserSessions} from '@/lib/admin';
import {updateStore} from '@/lib/local-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
// Owner approval of pending administrator accounts. Carried over from the
// Cloudflare frontend's functional contract; persists in the local store.
export async function GET(){try{
 const i=await adminIdentity();
 if(!i.user)return Response.json({error:'Please log in.'},{status:401});
 const requests=i.role==='owner'
  ?updateStore(s=>s.accounts.filter(u=>u.is_owner===0).map(({user_id,user_name,role,created_at,status}:any)=>({user_id,user_name,role,created_at,status})))
  :[];
 return Response.json({role:i.role,request:i.request,requests},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:(e as Error).message},{status:500})}}
export async function POST(req:Request){if(!sameOrigin(req))return Response.json({error:'Invalid request.'},{status:403});
 try{
  const i=await adminIdentity();
  if(i.role!=='owner')return Response.json({error:'Only the owner can approve administrator access.'},{status:403});
  const b=await req.json() as any;
  if(!['approve','reject'].includes(b.action)||typeof b.userId!=='string')return Response.json({error:'Invalid action.'},{status:400});
  const changed=updateStore(s=>{
   const account=s.accounts.find(u=>u.user_id.toLowerCase()===b.userId.toLowerCase()&&u.is_owner===0);
   if(!account)return false;
   account.status=b.action==='approve'?'approved':'rejected';
   return true;
  });
  if(!changed)return Response.json({error:'Administrator request not found.'},{status:404});
  // Mirrors the frontend: a decision revokes that account's active sessions.
  revokeUserSessions(b.userId);
  return Response.json({ok:true});
 }catch(e){return Response.json({error:(e as Error).message},{status:500})}}
