import {orchestrate} from '@/lib/orchestrator';
import {adminIdentity} from '@/lib/admin';
import {z} from 'zod';
const schema=z.object({updatedAt:z.string().datetime({offset:true}),message:z.string().optional(),places:z.array(z.object({id:z.string(),name:z.string(),visitors:z.number().nonnegative().nullable().optional(),capacity:z.number().nonnegative().nullable().optional(),upcomingVisitors:z.number().nonnegative().nullable().optional(),status:z.string().optional()}))});
export async function GET(){try{const i=await adminIdentity();if(!['owner','admin'].includes(i.role))return Response.json({error:'Administrator access required.'},{status:403});const r=schema.safeParse(await orchestrate({action:'map_snapshot'}));if(!r.success)throw Error('Live place information is incomplete.');return Response.json(r.data,{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:(e as Error).message},{status:503})}}
