import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { version } from './package.json';

// Serve plain HTTP by default: on localhost Chrome treats HTTP as a secure
// context, so the File System Access API (showSaveFilePicker / open pickers)
// works — under a self-signed cert Chrome silently suppresses those dialogs.
// Opt into the self-signed HTTPS cert with `HTTPS=1 pnpm dev` only when you need
// a secure origin over the LAN (e.g. GPS/geolocation on a phone).
const useHttps = process.env.HTTPS === '1' || process.env.HTTPS === 'true';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      // Prompt mode: the new service worker waits and only activates on the
      // next launch (or an explicit user reload). Never hot-swap the SW while a
      // course setter is editing — they may be offline in the field. See ADR-018.
      registerType: 'prompt',
      injectRegister: null, // we register via useRegisterSW() ourselves
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-icon.svg'],
      manifest: {
        name: 'Overprint — Orienteering Course Setting',
        short_name: 'Overprint',
        description:
          'Web-based orienteering course setting software. Design courses, export PDFs, manage events — all in your browser.',
        lang: 'en',
        theme_color: '#C850A0',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole shell — including the sample map/event, the PDF
        // fonts, and the pdf.js worker — so first offline use works without any
        // prior network round-trip. The dist is a few MB; that is the point of a
        // field tool. Sample/OCAD extensions must be listed explicitly.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,webmanifest,overprint,ocd}',
        ],
        // pdf.js worker + main bundle are ~1.2 MB each; give generous headroom.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SPA: serve the precached index.html for any navigation when offline.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true, // single sw.js — no extra hashed workbox-*.js
      },
      // Keep dev clean: SW behaviour is verified via `pnpm build && vite preview`
      // (a registered SW under the self-signed dev cert is a footgun).
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true, // expose on LAN for phone testing
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(process.env.CF_PAGES_COMMIT_SHA ?? 'local'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Polyfill Node.js Buffer for ocad2geojson (uses Buffer internally)
      buffer: 'buffer/',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Unit tests live beside source; the Playwright e2e suite (tests/e2e/*.spec.ts)
    // is run separately via `pnpm test:e2e` and must not be picked up by Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // The OMAP/OCAD fidelity tests parse real map fixtures and can exceed the
    // 5s default per-test timeout on slower (CI) runners — give them headroom.
    testTimeout: 20_000,
  },
});
