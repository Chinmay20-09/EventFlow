'use client';
// Adapted from the supplied EventGoogleMap / GoogleTrafficMapLayer components.
// All node, edge and route data remains owned by EventFlow's backend.
import {useEffect,useRef,useState} from 'react';
import {applySavedLock,zoomWithinLock,pointWithinLock} from '@/lib/map-lock';
let loader:Promise<any>|undefined;
function loadGoogle(){
 if(loader)return loader;
 loader=fetch('/api/map-config').then(async r=>{if(!r.ok)throw Error('Map configuration is unavailable.');return r.json()}).then((config:any)=>new Promise<any>((resolve,reject)=>{
  if(!config.apiKey){reject(Error('Add GOOGLE_MAPS_API_KEY to frontend/.env.local, then restart npm run dev.'));return}
  const w=window as any;if(w.google?.maps){resolve(w.google.maps);return}
  const timeout=window.setTimeout(()=>reject(Error('Google Maps did not respond. Check your connection and reload.')),20000);
  w.eventFlowGoogleReady=()=>{clearTimeout(timeout);resolve(w.google.maps);delete w.eventFlowGoogleReady};
  w.gm_authFailure=()=>{clearTimeout(timeout);window.dispatchEvent(new Event('eventflow:map-auth-error'));reject(Error('Google Maps authorization failed. Check the key, billing and website restrictions.'))};
  const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey)}&loading=async&callback=eventFlowGoogleReady&v=weekly`;script.async=true;script.onerror=()=>{clearTimeout(timeout);reject(Error('Google Maps could not load. Check your connection.'))};document.head.appendChild(script);
 })).catch(e=>{loader=undefined;throw e});return loader;
}
const darkStyles=[{elementType:'geometry',stylers:[{color:'#202d40'}]},{elementType:'labels.text.fill',stylers:[{color:'#c3d1e5'}]},{elementType:'labels.text.stroke',stylers:[{color:'#202d40'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#111d30'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#3a4960'}]}];
export function geometryPaths(geometry:any):{lat:number;lng:number}[][]{
 if(!geometry)return [];if(geometry.type==='Feature')return geometryPaths(geometry.geometry);
 if(geometry.type==='FeatureCollection')return geometry.features.flatMap((f:any)=>geometryPaths(f));
 if(geometry.type==='GeometryCollection')return geometry.geometries.flatMap((g:any)=>geometryPaths(g));
 const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
 return lines.filter(Array.isArray).map((line:any[])=>line.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>({lat:p[1],lng:p[0]})));
}
export default function EventGoogleMap({event,graph,mode,dark,place,from,onReady,onPick,onNode,onMessage}:any){
 const host=useRef<HTMLDivElement>(null),map=useRef<any>(null),api=useRef<any>(null),latest=useRef<any>(null);
 latest.current={onPick,onNode,onMessage,onReady,graph};
 const [ready,setReady]=useState(false),[traffic,setTraffic]=useState(true),[satellite,setSatellite]=useState(false),[failure,setFailure]=useState(''),[selectedRoute,setSelectedRoute]=useState<any>(null);
 useEffect(()=>{let alive=true;const auth=()=>setFailure('Google Maps authorization failed. Check the API key, billing and website restrictions.');window.addEventListener('eventflow:map-auth-error',auth);
 loadGoogle().then(G=>{if(!alive)return;api.current=G;const m=new G.Map(host.current,{disableDefaultUI:true,gestureHandling:'greedy',clickableIcons:false,backgroundColor:'transparent',center:{lat:0,lng:0},zoom:1});map.current=m;
 m.addListener('click',(e:any)=>{if(e.latLng&&pointWithinLock(e.latLng.toJSON(),latest.current.graph.location))latest.current.onPick({lat:String(e.latLng.lat()),lon:String(e.latLng.lng()),display_name:'Dropped pin'})});
 const facade={native:m,google:G,zoomIn:()=>zoomWithinLock(m,1,latest.current.graph.location),zoomOut:()=>zoomWithinLock(m,-1,latest.current.graph.location),getZoom:()=>m.getZoom(),getCenter:()=>m.getCenter()?.toJSON(),getBounds:()=>{const b=m.getBounds()?.toJSON();return b&&{getNorth:()=>b.north,getSouth:()=>b.south,getEast:()=>b.east,getWest:()=>b.west}},panTo:(p:any)=>{const point=Array.isArray(p)?{lat:p[0],lng:p[1]}:p;if(pointWithinLock(point,latest.current.graph.location))m.panTo(point);else latest.current.onMessage('Your location is outside the locked event area. Unlock & reframe to move there.')}};
 latest.current.onReady(facade);setReady(true);
 }).catch(e=>{if(alive)setFailure(e.message)});return()=>{alive=false;window.removeEventListener('eventflow:map-auth-error',auth);if(map.current)api.current.event.clearInstanceListeners(map.current);map.current=null;latest.current.onReady(null)}},[]);
 const locationKey=JSON.stringify({id:event?.id,location:graph.location,bounds:event?.bounds,lat:event?.lat,lon:event?.lon});
 useEffect(()=>{if(!ready)return;const m=map.current,l=graph.location;applySavedLock(m,l);
 if(l?.locked&&l.center){m.setCenter(l.center);m.setZoom(l.zoom)}else if(event){if(event.bounds)m.fitBounds(event.bounds);else {m.setCenter({lat:event.lat,lng:event.lon});m.setZoom(12)}}
 },[ready,locationKey]);
 useEffect(()=>{if(ready)map.current.setOptions({styles:[...(dark?darkStyles:[]),...(mode!=='map'?[{featureType:'poi',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'labels',stylers:[{visibility:'off'}]}]:[])],mapTypeId:satellite?'satellite':'roadmap'})},[ready,dark,satellite,mode]);
 useEffect(()=>{if(!ready)return;const layer=new api.current.TrafficLayer({autoRefresh:true});if(traffic)layer.setMap(map.current);return()=>layer.setMap(null)},[ready,traffic]);
 useEffect(()=>{if(!ready||!place)return;const marker=new api.current.Marker({map:map.current,position:{lat:+place.lat,lng:+place.lon},title:place.display_name,zIndex:20});return()=>marker.setMap(null)},[ready,place?.lat,place?.lon,place?.display_name]);
 useEffect(()=>{if(!ready||!graph.location?.locked)return;const rectangle=new api.current.Rectangle({map:map.current,bounds:graph.location.bounds,strokeColor:'#367df0',strokeWeight:2,fillOpacity:0,clickable:false});return()=>rectangle.setMap(null)},[ready,locationKey]);
 useEffect(()=>{setSelectedRoute(null)},[mode,graph.routes]);
 useEffect(()=>{if(!ready||!graph.location?.locked||mode==='map')return;const G=api.current,m=map.current,objects:any[]=[],bounds=new G.LatLngBounds(graph.location.bounds),colors:Record<string,string>={gate:'#20a879',venue:'#367df0',junction:'#b37de7'};
 for(const n of graph.nodes){const position={lat:n.latitude,lng:n.longitude};if(!bounds.contains(position))continue;const marker=new G.Marker({map:m,position,title:`${n.name} · ${n.type}`,icon:{path:G.SymbolPath.CIRCLE,scale:n.node_id===from?12:8,fillColor:colors[n.type]??'#367df0',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}});marker.addListener('click',()=>latest.current.onNode(n));objects.push(marker)}
 const routes:any[]=[];for(const item of [...graph.edges.map((e:any)=>({...e,isRoute:false})),...(mode==='routes'?graph.routes.map((r:any)=>({...r,isRoute:true})):[])])for(const path of geometryPaths(item.geometry)){
 // Reject out-of-area geometry rather than rendering nodes/edges outside the saved area.
 if(path.length<2||!path.every(p=>bounds.contains(p)))continue;
 const color=item.color??(item.isRoute?'#367df0':'#889ab4');const line=new G.Polyline({map:m,path,strokeColor:color,strokeWeight:item.isRoute?5:3,strokeOpacity:item.isRoute?0:1,icons:item.isRoute?[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,strokeColor:color,scale:3},offset:'0',repeat:'20px'}]:undefined});if(item.isRoute){line.addListener('click',()=>setSelectedRoute(item));routes.push(line)}objects.push(line)}
 let frame=0,start:number|undefined;const animate=(time:number)=>{start??=time;for(const line of routes){const icons=line.get('icons');icons[0].offset=`${((time-start)/70)%20}px`;line.set('icons',icons)}frame=requestAnimationFrame(animate)};if(routes.length&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)frame=requestAnimationFrame(animate);
 return()=>{cancelAnimationFrame(frame);objects.forEach(o=>{G.event.clearInstanceListeners(o);o.setMap(null)})}
 },[ready,mode,graph.nodes,graph.edges,graph.routes,locationKey,from]);
 function focus(){const l=graph.location;if(l?.locked){map.current.setCenter(l.center);map.current.setZoom(Math.max(l.zoom,map.current.getZoom()??l.zoom))}else if(event?.bounds)map.current.fitBounds(event.bounds)}
 return <><div id="map" ref={host}/>{(!ready||failure)&&<div className="google-map-status" role="status">{failure||'Loading Google Maps…'}</div>}{ready&&!event&&!graph.location&&<div className="google-map-status">Choose an event city to open its map.</div>}<div className="google-map-tools"><button disabled={!ready} aria-pressed={traffic} onClick={()=>setTraffic(!traffic)}>Traffic {traffic?'on':'off'}</button><button disabled={!ready} aria-pressed={satellite} onClick={()=>setSatellite(!satellite)}>{satellite?'Map view':'Satellite'}</button><button disabled={!ready||!event} onClick={focus}>Event area</button></div>{selectedRoute&&<div className="google-route-info" role="status"><button aria-label="Close route details" onClick={()=>setSelectedRoute(null)}>×</button><strong>{selectedRoute.name??selectedRoute.label??'Selected route'}</strong>{selectedRoute.severity&&<p>{selectedRoute.severity}</p>}{selectedRoute.summary&&<p>{selectedRoute.summary}</p>}</div>}</>
}
