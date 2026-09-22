import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../http/app.js';
import { createHarness, type TestHarness } from './helpers.js';

/**
 * These need a served build, which the shared `startServer` deliberately does
 * not have — every other suite talks to the API only. A fake `dist` with the
 * three files that matter is enough, and keeps the suite independent of
 * whether the web app has been built.
 */
let harness: TestHarness;
let dist: string;
let server: Server;
let url: string;

beforeEach(async () => {
  harness = createHarness();
  dist = mkdtempSync(join(tmpdir(), 'mesa-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ballot</title>');
  writeFileSync(join(dist, 'wall.html'), '<!doctype html><title>wall</title>');
  mkdirSync(join(dist, 'noren'));
  writeFileSync(join(dist, 'noren', 'forge-speeches.html'), '<!doctype html><title>noren</title>');

  const app = createApp(harness.ctx, { staticDir: dist });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
  harness.dispose();
});

describe('the speeches wall', () => {
  it('is served at /wall, without an extension', async () => {
    const response = await fetch(`${url}/wall`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>wall</title>');
  });

  it('is not swallowed by the ballot catch-all', async () => {
    // The wall is a second page in the build, not a route inside the SPA. Get
    // the ordering wrong and a projector quietly shows the voting screen.
    expect(await (await fetch(`${url}/wall`)).text()).not.toContain('<title>ballot</title>');
    expect(await (await fetch(`${url}/anything-else`)).text()).toContain('<title>ballot</title>');
  });

  it('never caches — a hall must not project a stale build', async () => {
    expect((await fetch(`${url}/wall`)).headers.get('cache-control')).toBe('no-store');
  });

  it('lets its own artwork be framed, and nothing else', async () => {
    // DENY is absolute: it refuses the frame to the same origin too, so under
    // the blanket header the wall renders Chrome's blocked-content placeholder
    // instead of the noren. Verified in Chrome against a production-like
    // server, which is the only place the header exists — dev has none.
    const noren = await fetch(`${url}/noren/forge-speeches.html`);
    expect(noren.headers.get('x-frame-options')).toBe('SAMEORIGIN');

    // The pages themselves, and the API, stay unframeable.
    expect((await fetch(`${url}/wall`)).headers.get('x-frame-options')).toBe('DENY');
    expect((await fetch(`${url}/`)).headers.get('x-frame-options')).toBe('DENY');
    expect((await fetch(`${url}/api/health`)).headers.get('x-frame-options')).toBe('DENY');
  });
});
