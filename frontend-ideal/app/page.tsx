import {redirect} from 'next/navigation';
import {adminIdentity} from '@/lib/admin';
export const dynamic='force-dynamic';
export default async function Home(){
 // Approved administrators and the owner enter the app; anonymous and
 // pending/rejected visitors stay on the administrator screen (approval
 // workflow carried over from the Cloudflare frontend).
 const {role}=await adminIdentity();
 redirect(role==='owner'||role==='admin'?'/live-map':'/admin');
}
