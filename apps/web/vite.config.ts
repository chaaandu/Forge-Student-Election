import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { watch } from 'node:fs';

/**
 * Import candidate photographs as they are dropped in, during development.
 *
 * Photographs arrive one at a time over days, usually from someone who is not
 * going to run a command afterwards. This watches the drop folder and runs the
 * optimiser when it changes, so a file copied into `assets/candidate-photos/`
 * becomes a cropped, compressed photo in the asset graph, and Vite reloads the
 * page with it in place of that candidate's initials.
 *
 * Development only — the build runs the same import once, up front.
 */
function candidatePhotos(): Plugin {
  const drop = fileURLToPath(new URL('../../assets/candidate-photos', import.meta.url));
  const root = fileURLToPath(new URL('../..', import.meta.url));

  return {
    name: 'mesa:candidate-photos',
    apply: 'serve',
    configureServer(server) {
      let pending: NodeJS.Timeout | undefined;

      const watcher = watch(drop, () => {
        // A copied file fires several events; settle before converting.
        clearTimeout(pending);
        pending = setTimeout(() => {
          execFile(
            'node',
            ['scripts/import-candidate-photos.mjs'],
            { cwd: root },
            (error, stdout) => {
              if (error) {
                server.config.logger.warn(`[photos] import failed: ${error.message}`);
                return;
              }
              for (const line of stdout.split('\n').filter((l) => l.includes('✓'))) {
                server.config.logger.info(`[photos]${line.replace('  ✓', '')}`);
              }
            },
          );
        }, 400);
      });

      server.httpServer?.once('close', () => {
        clearTimeout(pending);
        watcher.close();
      });
    },
  };
}

/**
 * Serve the speeches wall at `/wall`, not `/wall.html`.
 *
 * It is a URL somebody types into a projector-room browser, or reads off a
 * printed run sheet, so it should not carry a file extension. Vite's dev and
 * preview servers both map a bare path to `index.html`, which would quietly
 * hand the projector the ballot; this rewrites the path before that happens.
 *
 * The production server does the same thing in `apps/server/src/http/app.ts`,
 * where the SPA catch-all would otherwise do exactly the same thing.
 */
function wallRoute(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const [path] = (req.url ?? '').split('?');
    if (path === '/wall' || path === '/wall/') req.url = '/wall.html';
    next();
  };

  return {
    name: 'mesa:wall-route',
    configureServer: (server) => () => server.middlewares.use(rewrite),
    configurePreviewServer: (server) => () => server.middlewares.use(rewrite),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), candidatePhotos(), wallRoute()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@mesa/election-core': fileURLToPath(
        new URL('../../packages/election-core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin in production; proxied in development so the browser never
      // needs to know the API lives anywhere else.
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      /**
       * Two pages, not one. `index.html` is the ballot a voter touches;
       * `wall.html` is the noren projected in the hall while candidates speak.
       * Listing both keeps the 3D scene out of the voting bundle and the voting
       * machine out of the projector's.
       */
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        wall: fileURLToPath(new URL('./wall.html', import.meta.url)),
      },
    },
    /**
     * Three.js is ~747 KB, and that is fine — it is dynamically imported by the
     * welcome screen's decorative sheet only, so Rollup emits it as a separate
     * chunk that no voting path ever downloads. The application bundle stays
     * around 275 KB.
     *
     * The limit is raised past the three chunk deliberately, so the warning
     * still fires if the APPLICATION bundle ever grows to that size.
     */
    chunkSizeWarningLimit: 800,
  },
});
