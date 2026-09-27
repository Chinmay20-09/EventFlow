import {existsSync,copyFileSync} from 'node:fs';
if(!existsSync('.env.local')){
 copyFileSync('.env.local.example','.env.local');
 console.log('Created .env.local beside package.json. Add your GOOGLE_MAPS_API_KEY there.');
}else console.log('.env.local already exists; your settings were not changed.');
