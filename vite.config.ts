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

// Our base-map server sends no Access-Control-Allow-Origin, so the browser
// refuses the style, its sprites, its glyphs and its PMTiles archive alike.
// Proxying the whole host under /base-map makes them same-origin in dev — but
// the style.json points at itself with absolute URLs, which would escape the
// proxy again, so JSON bodies get those URLs rewritten on the way through.
// They are rewritten to an absolute URL back at this dev server, not to a
// /base-map path: MapLibre rejects a relative *sprite* URL outright ("must be
// absolute"), which costs you every icon in the style while labels still draw.
// Setting the CORS header on the style server makes all of this unnecessary.
const BASE_MAP_ORIGIN = 'https://base-map.blaulichtnavi.de';
const BASE_MAP_PROXY_PATH = '/base-map';

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
      [BASE_MAP_PROXY_PATH]: {
        target: BASE_MAP_ORIGIN,
        changeOrigin: true,
        rewrite: (requestPath) =>
          requestPath.replace(new RegExp(`^${BASE_MAP_PROXY_PATH}`), ''),
        // Buffering a body only works on identity-encoded bytes, and asking
        // upstream not to compress is cheaper than gunzipping here.
        headers: { 'accept-encoding': 'identity' },
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            const status = proxyRes.statusCode ?? 502;
            const headers = { ...proxyRes.headers };

            // Everything but the style documents (sprites, glyphs, PMTiles
            // ranges) is opaque to us and streams straight through.
            if (!headers['content-type']?.includes('json')) {
              res.writeHead(status, headers);
              proxyRes.pipe(res);
              return;
            }

            // Taken from the request so the LAN address works as well as
            // localhost, since the dev server listens on 0.0.0.0.
            const scheme = 'encrypted' in req.socket ? 'https' : 'http';
            const proxiedOrigin = `${scheme}://${req.headers.host}${BASE_MAP_PROXY_PATH}`;

            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const body = Buffer.concat(chunks)
                .toString('utf-8')
                .split(BASE_MAP_ORIGIN)
                .join(proxiedOrigin);

              delete headers['content-length'];
              res.writeHead(status, {
                ...headers,
                'content-length': Buffer.byteLength(body),
              });
              res.end(body);
            });
          });
        },
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
