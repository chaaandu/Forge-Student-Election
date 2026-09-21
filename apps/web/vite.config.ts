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
    // The kiosk loads this once at the start of the day; keep it honest anyway.
    chunkSizeWarningLimit: 400,
  },
});
