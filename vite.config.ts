import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Polyfill Node.js Buffer for ocad2geojson (uses Buffer internally)
      buffer: 'buffer/',
    },
  },
  define: {
    // Make Buffer globally available for ocad2geojson
    'globalThis.Buffer': 'globalThis.Buffer',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
