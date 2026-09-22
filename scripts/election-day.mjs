#!/usr/bin/env node
/**
 * Run the election from a laptop, optionally reachable from the internet.
 *
 * This exists because the obvious thing — push the repository to a static or
 * serverless host — cannot work, and fails in the worst possible way. The whole
 * one-person-one-vote guarantee is a `BEGIN IMMEDIATE` transaction against a
 * single SQLite file owned by a single process (docs/architecture.md, ADR-3).
 * A serverless platform gives you a read-only filesystem, a scratch `/tmp` that
 * is wiped between invocations, and several concurrent instances that cannot
 * see each other's writes. Deployed there the system does not refuse to run; it
 * accepts ballots into databases that are then discarded. A deployment that
 * loses votes quietly is the one outcome this codebase is built to prevent.
 *
 * So the server stays where it can hold a file: one machine, in the room.
 *
 *   node scripts/election-day.mjs             # hall wifi only
 *   node scripts/election-day.mjs --tunnel    # plus a public https URL
 *
 * `--tunnel` runs a Cloudflare quick tunnel, which is free, needs no account
 * and no card, and terminates TLS for you. It does not move the database: every
 * request still lands on this laptop, and this laptop still owns the only copy
 * of the election. Close the lid and the election stops — which is the honest
 * shape of the trade, and the reason the LAN mode below is the safer default.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const SERVER_ENTRY = fileURLToPath(new URL('apps/server/dist/main.js', ROOT));
const SPA_ENTRY = fileURLToPath(new URL('apps/web/dist/index.html', ROOT));

const wantsTunnel = process.argv.includes('--tunnel');
const PORT = process.env.PORT ?? '8787';

const children = [];
let shuttingDown = false;

function fail(message, remedy) {
  console.error(`\n  ${message}\n`);
  if (remedy) console.error(`  ${remedy}\n`);
  // Take down anything already started. The server is spawned before the
  // tunnel, so failing after that point used to leave it running with no
  // launcher attached, still holding the port and the database — and the
  // obvious next move, running the command again, then died on EADDRINUSE
  // with the real election server sitting invisibly behind it.
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(1);
}

/** The addresses a kiosk on the venue wifi can actually reach. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  // The server closes the database on SIGTERM; give it that chance before the
  // process group goes away, or the -wal file is left for recovery on restart.
  // Deliberately not unref'd: an unref'd timer lets Node exit the instant the
  // children are gone, which both cuts that grace period short and reports 0
  // for a shutdown that was a failure.
  setTimeout(() => process.exit(code), 1500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// --------------------------------------------------------------- preflight ---

if (!existsSync(SERVER_ENTRY)) {
  fail('The server is not built.', 'Run: npm run build');
}
if (!existsSync(SPA_ENTRY)) {
  // Without this the API answers but every voter gets a blank page, which on
  // the day looks like the network rather than a missing build step.
  fail('The ballot is not built.', 'Run: npm run build');
}

/**
 * Refuse to start on a port somebody else already holds.
 *
 * Without this the failure is silent and actively misleading. A dev server left
 * running from `npm run dev` owns the port; the real server spawns, dies on
 * EADDRINUSE, and the health check below — which only asks whether *something*
 * answers on localhost — finds the dev server, passes, and prints the banner.
 * The operator is told the election is up, on a process that exited seconds ago
 * and against a database that may not even be the one configured here.
 */
async function portIsTaken(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(Number(port), '0.0.0.0');
  });
}

if (await portIsTaken(PORT)) {
  fail(
    `Something is already listening on port ${PORT}.`,
    'Almost always `npm run dev` in another terminal. Stop it, or set PORT to something else.',
  );
}

// ------------------------------------------------------------- the server ---

const server = spawn(process.execPath, [SERVER_ENTRY], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT },
});
children.push(server);

server.on('exit', (code) => {
  if (!shuttingDown) {
    // Almost always a production boot guard doing its job (apps/server/src/config/env.ts).
    console.error('\n  The election server stopped. Nothing above it is running.\n');
    shutdown(code ?? 1);
  }
});

// -------------------------------------------------------------- the tunnel ---

async function waitForHealth(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function startTunnel() {
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(tunnel);

  tunnel.on('error', (error) => {
    if (error.code === 'ENOENT') {
      fail(
        'cloudflared is not installed, so there is no public URL.',
        'Install it (macOS: brew install cloudflared) or drop --tunnel and use the hall wifi addresses above.',
      );
    }
    throw error;
  });

  let announced = false;
  const watch = (chunk) => {
    const text = String(chunk);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !announced) {
      announced = true;
      banner([
        ['Public link (share this)', match[0]],
        ['Election desk', `${match[0]}/monitor`],
        ['Speeches wall', `${match[0]}/wall`],
      ]);
      // Said once, plainly, because it is the thing that goes wrong: the URL is
      // regenerated on every restart, so anything printed or pinned dies with
      // this process.
      console.log('  This URL lasts only as long as this command. Restarting changes it.');
      /*
        Wait before opening it. The hostname is registered the moment this line
        is printed, but it is not resolvable everywhere yet, and a lookup that
        arrives too early is answered NXDOMAIN — which a home or venue router
        then negative-caches for a minute or more. Measured here: queried
        immediately, it failed for 65 seconds straight and then resolved;
        queried once after a 35 second wait, it answered first time. So the
        impatient check is what causes the outage it appears to be reporting.
      */
      console.log('  Give it ~30 seconds before opening it. Too early and it caches as broken.\n');
    }
  };
  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);
}

function banner(rows) {
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log('');
  for (const [label, value] of rows) console.log(`  ${label.padEnd(width)}  ${value}`);
  console.log('');
}

const ready = await waitForHealth();
if (!ready) {
  fail('The server did not come up.', 'Check the output above; a boot guard may have refused it.');
}

banner([
  ['This laptop', `http://localhost:${PORT}`],
  ...lanAddresses().map((address) => ['Hall wifi (kiosks)', `http://${address}:${PORT}`]),
]);

if (wantsTunnel) {
  console.log('  Opening a Cloudflare quick tunnel...\n');
  startTunnel();
} else {
  console.log('  No public URL. Kiosks must be on the same wifi as this laptop.');
  console.log('  Add --tunnel if they cannot be.\n');
}

console.log('  Back up the database and its -wal file before you finish. Ctrl-C to stop.\n');
