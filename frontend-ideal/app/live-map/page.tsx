import MapApp from '../map-app';
import {requireAdministrator} from '@/lib/admin';
export default async function Page(){await requireAdministrator();return <MapApp/>}
