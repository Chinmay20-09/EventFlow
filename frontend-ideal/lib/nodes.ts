import {readStore,updateStore} from './local-store';
import {currentEvent,records} from './operations';
export const nodeOptions={types:['gate','venue','junction'],statuses:['active','inactive','closed'],defaultStatus:'active'};
export async function eventKey(routeId:string){const event=await currentEvent();if(!event||String(event.id)!==routeId)throw Error('Event not found.');return routeId}
export async function listNodes(routeId:string){await eventKey(routeId);return readStore().nodes.filter(n=>String(n.event_id)===routeId)}
export async function nodeRow(routeId:string,nodeId:number){return (await listNodes(routeId)).find(n=>n.node_id===nodeId)}
export async function saveNode(routeId:string,body:any,nodeId?:number){
 await eventKey(routeId);const previous=nodeId?await nodeRow(routeId,nodeId):null;if(nodeId&&!previous)throw Error('Node not found.');
 const allowed=['external_id','name','type','latitude','longitude','capacity','status'];
 if(!body||Object.keys(body).some(k=>!allowed.includes(k)))throw Error('Unknown node field.');
 const n={...previous,...body};
 if(typeof n.name!=='string'||!n.name.trim()||n.name.trim().length>120||!nodeOptions.types.includes(n.type)||!nodeOptions.statuses.includes(n.status)||!Number.isInteger(n.capacity)||n.capacity<=0||!Number.isFinite(n.latitude)||!Number.isFinite(n.longitude)||Math.abs(n.latitude)>90||Math.abs(n.longitude)>180||(n.external_id!=null&&(typeof n.external_id!=='string'||n.external_id.length>80)))throw Error('Enter a valid name, type, status, positive capacity and map coordinates.');
 const location=(await records(routeId)).find(r=>r.kind==='location')?.data,b=location?.bounds;
 if(!location?.locked||n.latitude<b.south||n.latitude>b.north||n.longitude<b.west||n.longitude>b.east)throw Error('Choose a pin within the locked event area.');
 return updateStore(s=>{
  const row={node_id:nodeId??s.nextNodeId++,event_id:routeId,external_id:n.external_id?.trim()||null,name:n.name.trim(),type:n.type,latitude:n.latitude,longitude:n.longitude,capacity:n.capacity,status:n.status,created_at:previous?.created_at??new Date().toISOString()};
  if(nodeId)s.nodes=s.nodes.map(x=>x.node_id===nodeId&&x.event_id===routeId?row:x);else s.nodes.push(row);
  return row;
 });
}
