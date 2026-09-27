import {redirect} from 'next/navigation';
export default function Admin(){
 // Auth removed for local development: the administrator screen is unreachable.
 redirect('/live-map');
}
