import path from 'path';
import { readFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { renderedPages, renderPublicPage } from './scripts/public-pages.mjs';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'public-html-routes',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          const route = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
          if (route === '/about') {
            req.url = req.url!.replace(/^\/about(?=\/?(?:\?|$))/, '/about.html');
            return next();
          }
          if (!(route in renderedPages)) return next();
          try {
            const shell = await readFile(path.resolve(import.meta.dirname, 'index.html'), 'utf8');
            const html = await renderPublicPage(server, route, await server.transformIndexHtml(route, shell));
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(req.method === 'HEAD' ? undefined : html);
          } catch (error) {
            server.ssrFixStacktrace(error as Error);
            next(error);
          }
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.method === 'GET' || req.method === 'HEAD') {
            const route = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';
            if (route === '/about' || (route !== '/' && route in renderedPages)) {
              req.url = req.url!.replace(/^\/[^/?]+\/?(?=\?|$)/, `/${route.slice(1)}.html`);
            }
          }
          next();
        });
      },
    },
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    // Workspace packages import React Query directly. Keep its context singleton
    // aligned with the provider used by this app in production bundles.
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(import.meta.dirname, 'index.html'),
        about: path.resolve(import.meta.dirname, 'about.html'),
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
