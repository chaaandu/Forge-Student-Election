/** Print a ready-to-paste block of freshly generated secrets. */
import { randomBytes } from 'node:crypto';

const secret = () => randomBytes(32).toString('base64url');
const kiosk = secret();

console.log(
  `\n# Generated ${new Date().toISOString()} — paste into .env, then never commit it.\n` +
    `ADMIN_API_TOKEN=${secret()}\n` +
    `ACCESS_CODE_PEPPER=${secret()}\n` +
    `HASH_SALT=${secret()}\n` +
    `KIOSK_TOKEN=${kiosk}\n` +
    `VITE_KIOSK_TOKEN=${kiosk}   # must match KIOSK_TOKEN\n` +
    `\n# Rotating ACCESS_CODE_PEPPER invalidates every access code already issued.\n`,
);
