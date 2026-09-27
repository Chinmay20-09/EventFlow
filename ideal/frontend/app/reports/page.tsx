import OperationsView from '../operations-view';
import {requireAdministrator} from '@/lib/admin';
export default async function Page(){await requireAdministrator();return <OperationsView view='reports'/>}
