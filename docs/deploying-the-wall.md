# Deploying the speeches wall

The wall (`/wall`) is a static page: an HTML document, a 1.5 KB script and the
derived noren, which is committed to the repository. It needs no API, no
database and no network at run time, so it can go on any static host.

The rest of the application cannot. The ballot talks to an Express server with a
SQLite database behind it, and neither runs on a static host or a serverless
function with a read-only filesystem. **A Vercel deployment of this repository
serves the wall correctly; the ballot renders but every check-in fails**, because
there is no `/api` to answer it. Point a projector at it, not a booth.

## Vercel

`vercel.json` at the repository root pins the three things Vercel would
otherwise guess at.

Set the project's **Root Directory to the repository root**, not `apps/web`.
`apps/web` depends on the `@mesa/election-core` workspace, which is not
published to npm, so it cannot be installed on its own.

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
