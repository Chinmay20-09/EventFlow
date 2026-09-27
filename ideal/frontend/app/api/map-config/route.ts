import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
export const dynamic='force-dynamic';
export async function GET(){
 let apiKey=process.env.GOOGLE_MAPS_API_KEY?.trim()||process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()||null;
 // Accept the file used by the previous ZIP so existing local keys keep working.
 if(!apiKey){try{apiKey=parseEnv(readFileSync(join(process.cwd(),'.dev.vars'),'utf8')).GOOGLE_MAPS_API_KEY?.trim()||null}catch{}}
 return Response.json({apiKey},{headers:{'Cache-Control':'no-store'}});
}
