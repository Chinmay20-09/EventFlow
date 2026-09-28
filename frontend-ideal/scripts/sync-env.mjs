// Copies the shared keys from the repository root .env into this app's
// .env.local (run automatically by `npm run dev`; see the root README).
// This folder is also shipped stand-alone — outside the repository there is no
// root .env to sync, so the app keeps using its own .env.local unchanged.
import {existsSync} from 'node:fs';

const shared=new URL('../../scripts/sync-env.mjs',import.meta.url);
if(!existsSync(shared)){
 console.log('sync-env: no repository root found — using this app\'s own .env.local.');
 process.exit(0);
}
await import(shared.href);
