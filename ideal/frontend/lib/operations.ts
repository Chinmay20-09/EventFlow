import {readStore,updateStore} from './local-store';
import {z} from 'zod';
export async function currentEvent(){return readStore().event}
export function setCurrentEvent(event:any){return updateStore(s=>{s.event=event;return event})}
export async function record(kind:string,eventId:string,data:unknown,actor:string,parentId:string|null=null,id:string=crypto.randomUUID()){
 return updateStore(s=>{if(!s.records.some(r=>r.id===id))s.records.unshift({id,event_id:eventId,kind,parent_id:parentId,data,created_at:new Date().toISOString(),actor});return id});
}
export async function records(eventId:string){return readStore().records.filter(r=>r.event_id===eventId)}
export const metrics=z.array(z.object({label:z.string(),before:z.union([z.string(),z.number()]),after:z.union([z.string(),z.number()]),unit:z.string().optional()}));
export const analysisSchema=z.object({title:z.string(),description:z.string(),risk:z.string(),minutesToOvercrowding:z.number().nonnegative().nullable().optional(),baseline:metrics,strategies:z.array(z.object({id:z.string(),title:z.string(),description:z.string(),benefits:z.array(z.string()),recommended:z.boolean().optional()})).min(1)});
export const simulationSchema=z.object({metrics,crowdReduction:z.number().min(0).max(100).nullable().optional(),residualRisk:z.string(),constraintsPassed:z.boolean(),constraints:z.array(z.string()),directives:z.array(z.object({group:z.enum(['Transportation','Hospitality & Providers','Travelers']),message:z.string(),actions:z.array(z.string()),destination:z.object({lat:z.number().min(-90).max(90),lon:z.number().min(-180).max(180)}).optional()}))});
export const deliverySchema=z.object({updates:z.array(z.object({group:z.enum(['Transportation','Hospitality & Providers','Travelers']),status:z.enum(['queued','sent','failed','live']),message:z.string(),updatedAt:z.string().datetime({offset:true})}))});
