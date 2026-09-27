import {redirect} from 'next/navigation';
import {adminIdentity} from '@/lib/admin';
export default async function Home(){
 const {user}=await adminIdentity();
 redirect(user?'/live-map':'/admin');
}
