export type SavedLocation={locked:boolean;zoom:number;bounds:{north:number;south:number;east:number;west:number};center:{lat:number;lng:number}};

// This function is called only when saved event framing changes, never for layer tabs.
export function applySavedLock(map:any,location:SavedLocation|null|undefined){
 if(!location?.locked){map.setOptions({minZoom:0,restriction:null});return;}
 map.setOptions({minZoom:location.zoom,restriction:{latLngBounds:location.bounds,strictBounds:true}});
 if((map.getZoom()??location.zoom)<location.zoom)map.setZoom(location.zoom);
}
export function zoomWithinLock(map:any,delta:number,location?:SavedLocation|null){
 map.setZoom(Math.max(location?.locked?location.zoom:0,(map.getZoom()??0)+delta));
}
export function pointWithinLock(point:{lat:number;lng:number},location?:SavedLocation|null){
 if(!location?.locked)return true;
 const b=location.bounds;
 return point.lat>=b.south&&point.lat<=b.north&&point.lng>=b.west&&point.lng<=b.east;
}
