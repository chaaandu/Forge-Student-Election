# Deploying the speeches wall

The wall (`/wall`) is a static page: an HTML document, a 1.5 KB script and the
derived noren, which is committed to the repository. It needs no API, no
database and no network at run time, so it can go on any static host.

The rest of the application cannot. The ballot talks to an Express server with a
SQLite database behind it, and neither runs on a static host or a serverless
function with a read-only filesystem. **A Vercel deployment of this repository
serves the wall correctly; the ballot cannot work there**, because there is no
`/api` to answer it. Point a projector at it, not a booth.

That was a sentence in this document and nothing else, so the deployment went on
serving a ballot which failed on its very first request with

```
Failed to load resource: the server responded with a status of 404
[mesa] could not start the election session
SyntaxError: Unexpected token 'T', "The page c"... is not valid JSON
```

— Vercel's own HTML 404 page (`The page could not be found`) arriving where the
SPA expected JSON. Fixed in two layers:

- `apps/web/src/lib/api.ts` no longer lets a non-JSON body throw a bare
  `SyntaxError` out of `request()`. It becomes an `ApiError` with code
  `UPSTREAM`, counted as a network-class failure, because the same thing happens
  behind a reverse proxy returning an HTML 502 or a venue captive portal — and
  in those cases a ballot must stay retryable with the *same* idempotency key.
- `vercel.json` redirects `/` to `/wall`, so nobody is handed a ballot that has
  nothing to talk to.

## Vercel

`vercel.json` at the repository root pins the four things Vercel would otherwise
guess at. Two project settings have to agree with it, and if either does not,
the file is bypassed and the failure looks like something else entirely.

### Project Settings, in the dashboard

**Root Directory must be the repository root** — blank, or `.`. Not `apps/web`.

Two reasons. Vercel reads `vercel.json` *from the Root Directory*, so pointing
it at `apps/web` means this file is never read at all. And `apps/web` cannot
build on its own regardless: it depends on the `@mesa/election-core` workspace,
which is not published to npm, and both `tsconfig.app.json` and `vite.config.ts`
reach up into `../../packages/election-core/src`.

**Build & Output Settings must have no overrides.** Leave Build Command,
Output Directory and Install Command switched off, so the values here are the
ones used.

### `No Output Directory named "dist" found`

```
Error: No Output Directory named "dist" found after the Build completed.
```

The name in that message is the one Vercel actually used. This file sets
`apps/web/dist`, so a message naming plain `dist` means the file was not read,
or was overridden — the two settings above. `dist` is the Vite preset's default,
which is the giveaway: something fell back to framework detection.

`"framework": null` is set here for that reason. The build is driven explicitly
by `buildCommand` and `outputDirectory`; a detected preset has nothing to add
and can only override them.

### Why the build failed with `tsc: command not found`

```
sh: line 1: tsc: command not found
npm error code 127
npm error workspace @mesa/web@1.0.0
```

Vercel sets `NODE_ENV=production` for the build. npm reads that and defaults to
`omit=dev`, so **devDependencies are never installed** — and `typescript` and
`vite` are both devDependencies. The build then runs `tsc` against a
`node_modules` that has no TypeScript in it.

Confirmable without deploying anything:

```sh
NODE_ENV=production npm config get omit   # -> dev
```

Hence `installCommand: "npm ci --include=dev"`, which overrides that default.
Nothing about the build is production-inappropriate; these are build tools, and
a build needs them.

Two things were wrong and both are fixed:

1. **The install skipped the build tools.** The cause above, fixed in
   `vercel.json`.
2. **Three workspaces ran `tsc` without depending on it.** `apps/web`,
   `apps/server` and `packages/election-core` all invoke `tsc` in their scripts,
   but only the repository root declared `typescript`. It worked locally because
   npm hoists the root copy to `node_modules/.bin`, which is on `PATH` when a
   script runs from the root — and broke the moment anything ran with a narrower
   `PATH`. Each of the three now declares it. Reproducible locally:

   ```sh
   cd apps/web
   PATH=$PWD/node_modules/.bin:/usr/bin:/bin tsc -p tsconfig.app.json --noEmit
   # sh: tsc: command not found
   ```

### Routing

`rewrites` does two jobs:

- `/wall` → `/wall.html`, because the wall is a second page in the build and the
  URL should not carry an extension — somebody types it into a projector-room
  browser on the day.
- everything else → `/index.html`, the usual SPA fallback. Vercel only applies a
  rewrite when no static file matches, so `/noren/forge-speeches.html`,
  `/paper/*` and the hashed assets are still served directly.

`redirects` sends `/` to `/wall`. It has to be a redirect rather than a rewrite
for the same reason the SPA fallback works at all: Vercel checks the filesystem
*before* applying rewrites, and `/` matches `index.html`, so a rewrite on `/`
would never fire. Redirects are evaluated before that check. The ballot build is
still deployed and still reachable at `/index.html` if you want to look at the
screens — it simply is not what a visitor lands on.

The `(?!api/)` guard keeps a future serverless API reachable. There is none
today; it is there so adding one does not silently return the SPA.

### The frame headers do not carry over

`apps/server/src/http/app.ts` sends `X-Frame-Options: DENY` everywhere except
`/paper` and `/noren`, which the artwork frames need (see
`docs/design-direction.md` §5d). Vercel sends no such header at all, so the wall
works without any configuration — but the ballot is not protected there either.
That is acceptable only because the ballot on Vercel has no API, no session and
no data behind it. **If an API is ever added to this deployment, the header
rules have to come with it.**
