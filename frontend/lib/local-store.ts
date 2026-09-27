import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export type Account={user_id:string;user_name:string;role:'administrator';created_at:string;password_hash:string;salt:string;status:'approved';is_owner:number};
type State={accounts:Account[];sessions:{hash:string;userId:string;expiresAt:number}[];event:any;records:any[];nodes:any[];nextNodeId:number};
const directory=resolve(process.env.EVENTFLOW_DATA_DIR||join(process.cwd(),'.eventflow-local'));
const filename=join(directory,'data.json');
export function readStore():State {
 try {return JSON.parse(readFileSync(filename,'utf8'));}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return {accounts:[],sessions:[],event:null,records:[],nodes:[],nextNodeId:1};}
}
// Synchronous read-modify-write transactions avoid overlapping writes in this local, single-process server.
export function updateStore<T>(change:(state:State)=>T):T {
 const state=readStore(),result=change(state);
 mkdirSync(directory,{recursive:true,mode:0o700});
 const temporary=join(directory,randomUUID()+'.tmp');
 writeFileSync(temporary,JSON.stringify(state),{mode:0o600});
 renameSync(temporary,filename);
 return result;
}
