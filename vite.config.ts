import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

function getBaseUrl() {
  const { homepage } = JSON.parse(readFileSync('package.json', 'utf-8')) as {
    homepage?: string;
  };
  if (!homepage) return '/';

  // If it's a full URL, extract just the pathname
  if (homepage.startsWith('http')) {
    const url = new URL(homepage);
    return url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '') + '/';
  }

  const base = homepage.startsWith('/') ? homepage : `/${homepage}`;
  return base.replace(/\/$/, '') + '/';
}

// Target of the dev-only reverse proxy below. Not VITE_-prefixed, so it never
// reaches the client bundle and has to be read off disk explicitly.
const valhallaProxyTarget =
  loadEnv('development', process.cwd(), 'VALHALLA_PROXY_TARGET')
    .VALHALLA_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  base: getBaseUrl(),
  plugins: [
    react(),
    svgr({
      include: '**/*.svg',
      svgrOptions: { exportType: 'named', namedExport: 'ReactComponent' },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    // Lets the app talk to a Valhalla server that sends no CORS headers (and
    // can't answer the X-Client-Id preflight) as if it were same-origin. Point
    // VITE_VALHALLA_URL at http://localhost:3000/valhalla to use it.
    proxy: {
      '/valhalla': {
        target: valhallaProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/valhalla/, ''),
      },
    },
  },
  build: {
    outDir: 'build',
  },
  test: {
    environment: 'jsdom',
    pool: 'vmForks',
  },
});
