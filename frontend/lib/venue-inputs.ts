import {database} from './admin';
export function placeKey(lat:unknown,lon:unknown){if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Choose a place on the map first.');return `${lat.toFixed(5)},${lon.toFixed(5)}`}
export async function venueData(lat:number,lon:number){return database().prepare('SELECT expected,current,capacity,updated_at AS updatedAt FROM venue_inputs WHERE place_key=?').bind(placeKey(lat,lon)).first()}
