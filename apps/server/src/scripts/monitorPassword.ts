/**
 * Set the election desk's sign-in.
 *
 *   npm run monitor:password -- desk@school.edu 'the password'
 *
 * Prints the two lines to paste into apps/server/.env. The password itself is
 * never written anywhere — only a scrypt hash with a fresh random salt, which
 * is why this script can set a password and can never tell you one.
 *
 * The password is taken as an argument rather than prompted for so it can be
 * piped, which also means it lands in your shell history: clear it afterwards,
 * or prefix the command with a space if your shell honours HISTCONTROL.
 */
import { hashPassword } from '../services/adminAuth.js';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error(
    '\nUsage: npm run monitor:password -- <email> <password>\n\n' +
      "  npm run monitor:password -- desk@school.edu 'a long passphrase'\n",
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `\n✗ That password is ${password.length} characters. Use at least 12.\n` +
      '  This one credential opens the roll, the count and the reset.\n',
  );
  process.exit(1);
}

console.log(
  `\nPaste these into apps/server/.env (it is git-ignored):\n\n` +
    `MONITOR_EMAIL=${email}\n` +
    `MONITOR_PASSWORD_HASH=${hashPassword(password)}\n\n` +
    `Then restart the server. The desk at /monitor will ask for the address and\n` +
    `password instead of the admin token.\n`,
);
