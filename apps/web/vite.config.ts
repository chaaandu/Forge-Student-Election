import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
