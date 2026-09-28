import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export type AccountStatus='pending'|'approved'|'rejected';
export type Account={user_id:string;user_name:string;role:string;created_at:string;password_hash:string;salt:string;iterations?:number;status:AccountStatus;is_owner:number};
type State={accounts:Account[];sessions:{hash:string;userId:string;expiresAt:number}[];event:any;records:any[];nodes:any[];nextNodeId:number;rateLimits:{key:string;attempts:number;resetAt:number}[]};
const directory=resolve(process.env.EVENTFLOW_DATA_DIR||join(process.cwd(),'.eventflow-local'));
const filename=join(directory,'data.json');
function emptyState():State{return {accounts:[],sessions:[],event:null,records:[],nodes:[],nextNodeId:1,rateLimits:[]}}
// Pre-approval data files (original ideal ZIP) lack rateLimits and may hold
// pre-approval accounts; normalize on read so every caller sees the full schema.
function normalize(state:Partial<State>):State{
 return {...emptyState(),...state,rateLimits:state.rateLimits??[],accounts:(state.accounts??[]).map(a=>({...a,role:a.role??'administrator',status:a.status??'approved',is_owner:a.is_owner??1}))};
}
export function readStore():State {
 try {return normalize(JSON.parse(readFileSync(filename,'utf8')));}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return emptyState();}
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
