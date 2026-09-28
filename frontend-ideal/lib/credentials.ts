import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';

// Credential rules and password primitives, deliberately free of `next/*`
// imports so plain Node scripts (scripts/seed-test-admin.mjs) reuse the exact
// same hashing and validation rules as the auth API.
// Password policy from the Cloudflare frontend's functional contract (12-char minimum).
export const MIN_PASSWORD_LENGTH=12;
// User IDs follow the frontend's pattern: 3–64 chars, starts alphanumeric,
// then letters/digits/dot/underscore/hyphen. Compared case-insensitively.
export const USER_ID_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const newSalt=()=>randomBytes(16).toString('hex');
export const passwordHash=(password:string,salt:string)=>scryptSync(password,salt,64).toString('hex');
export function equalHash(a:string,b:string){const left=Buffer.from(a,'hex'),right=Buffer.from(b,'hex');return left.length===right.length&&timingSafeEqual(left,right)}
