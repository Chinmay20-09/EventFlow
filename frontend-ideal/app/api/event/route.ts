import {sameOrigin} from '@/lib/request';
import {adminIdentity} from '@/lib/admin';
import {currentEvent,setCurrentEvent,records} from '@/lib/operations';
export const dynamic='force-dynamic';
export async function GET(){try{if(!(await adminIdentity()).user)return Response.json({error:'Please log in.'},{status:401});return Response.json({event:await currentEvent()},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Could not read local event settings.'},{status:500})}}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request.'},{status:403});
 try{
  const who=await adminIdentity();if(!who.user)return Response.json({error:'Administrator login required.'},{status:403});
  const b=await req.json();
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>150||typeof b.city!=='string'||!b.city.trim()||b.city.length>200||![b.lat,b.lon].every(Number.isFinite)||Math.abs(b.lat)>90||Math.abs(b.lon)>180)throw Error('Enter an event name and select a city.');
  if(b.bounds&&(![b.bounds.north,b.bounds.south,b.bounds.east,b.bounds.west].every(Number.isFinite)||b.bounds.north<=b.bounds.south||b.bounds.east<=b.bounds.west))throw Error('Invalid city bounds.');
  const prev=await currentEvent(),moved=prev&&(prev.lat!==b.lat||prev.lon!==b.lon);
  if(moved&&(await records(prev.id)).find(r=>r.kind==='location')?.data.locked)return Response.json({error:'Unlock & reframe the saved event area before changing city.'},{status:409});
  let photo=moved?null:prev?.photo??null;
  if(!photo){try{
   const url=new URL('https://en.wikipedia.org/w/api.php');
   url.search=new URLSearchParams({action:'query',format:'json',titles:b.city,redirects:'1',prop:'pageimages|info',piprop:'thumbnail',pithumbsize:'600',inprop:'url'}).toString();
   const response=await fetch(url,{signal:AbortSignal.timeout(3000)}),json=await response.json();
   const page:any=Object.values(json.query?.pages??{}).find((p:any)=>p.thumbnail?.source);
   if(page)photo={url:page.thumbnail.source,title:page.title,source:page.fullurl};
  }catch{}}
  const event={id:!prev||moved?crypto.randomUUID():prev.id,name:b.name.trim(),city:b.city.trim(),lat:b.lat,lon:b.lon,bounds:b.bounds??(!moved?prev?.bounds:null)??null,photo};
  setCurrentEvent(event);return Response.json({event});
 }catch(error){return Response.json({error:(error as Error).message},{status:400})}
}
