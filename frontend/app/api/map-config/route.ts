import {env} from 'cloudflare:workers';
// Google browser keys are intentionally public; restrict this key to the site's referrer in Google Cloud.
export async function GET(){const config=env as unknown as Record<string,string>;return Response.json({apiKey:config.GOOGLE_MAPS_API_KEY??null},{headers:{'Cache-Control':'no-store'}})}
