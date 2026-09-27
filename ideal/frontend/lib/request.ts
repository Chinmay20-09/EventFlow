export function sameOrigin(request:Request){
 try{
  const origin=new URL(request.headers.get('origin')??'');
  // Next can normalize request.url to localhost even when the browser uses 127.0.0.1.
  const host=request.headers.get('host')??new URL(request.url).host;
  return ['http:','https:'].includes(origin.protocol)&&origin.host===host;
 }catch{return false}
}
