import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { isLocalRequest } from './server/local-access';

function localOnly() {
  const guard = (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => {
    if (isLocalRequest(request)) return next();
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Local access only.');
  };
  return {
    name: 'local-only',
    configureServer(server: import('vite').ViteDevServer) { server.middlewares.use(guard); },
    configurePreviewServer(server: import('vite').PreviewServer) { server.middlewares.use(guard); },
  };
}

export default defineConfig({
  plugins: [
    localOnly(),
    react(),
    tailwindcss(),
    VitePWA({
      includeAssets: ['spot-ladder-logo.png', 'spot-ladder-apple.png'],
      manifest: {
        background_color: '#0f131c',
        display: 'standalone',
        icons: [
          {
            sizes: '192x192',
            src: '/spot-ladder-192.png',
            type: 'image/png',
          },
          {
            sizes: '512x512',
            src: '/spot-ladder-512.png',
            type: 'image/png',
          },
        ],
        name: 'Spot Ladder Analyzer',
        short_name: 'Spot Ladder',
        start_url: '/',
        theme_color: '#0f131c',
      },
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        changeOrigin: true,
        target: 'http://127.0.0.1:8787',
      },
    },
  },
  preview: { host: '127.0.0.1' },
  test: {
    environment: 'jsdom',
    exclude: ['dist/**', 'dist-server/**', 'e2e/**', 'node_modules/**'],
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
