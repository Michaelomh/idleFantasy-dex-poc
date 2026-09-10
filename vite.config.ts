import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Pin the Game Data runtime cache to the vendored snapshot's game version, so
// refreshing the snapshot (a new version_code) orphans the old cache naturally.
function gameDataVersion(): string {
  for (const p of ['./public/game-data/manifest.json', './vendor/game-data/manifest.json']) {
    try {
      return String(JSON.parse(readFileSync(p, 'utf8')).game.version_code);
    } catch {
      /* try next */
    }
  }
  return 'dev';
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages project site until a custom domain is added; dev stays at root.
  base: command === 'build' ? '/idleFantasy-dex/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'idleFantasy-dex',
        short_name: 'IF-dex',
        description: 'A completion dashboard for Idle Fantasy — how far every goal is from done.',
        theme_color: '#0D0E10',
        background_color: '#0D0E10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell + fonts only. Game Data is never precached.
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // Roboto Flex ships every Unicode subset; only Latin is used. The rest
        // stay lazy over the network rather than bloating the offline precache.
        globIgnores: [
          '**/roboto-*-cyrillic*',
          '**/roboto-*-greek*',
          '**/roboto-*-vietnamese*',
          '**/roboto-*-latin-ext*',
        ],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/game-data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: `game-data-${gameDataVersion()}`,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 3000 },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
}));
