import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
    proxy: {
      '/api': {
        changeOrigin: true,
        target: 'http://127.0.0.1:8787',
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['dist/**', 'dist-server/**', 'e2e/**', 'node_modules/**'],
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
