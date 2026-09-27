import {adminIdentity} from '@/lib/admin';
export async function GET(){const i=await adminIdentity();if(!i.user)return Response.json({error:'Please log in.'},{status:401});return Response.json({role:i.role,request:null,requests:[]},{headers:{'Cache-Control':'no-store'}})}
export async function POST(){return Response.json({error:'Approvals are not required for local administrator accounts.'},{status:400})}
