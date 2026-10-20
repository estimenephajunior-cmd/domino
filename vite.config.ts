/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Domino Engine',
        short_name: 'Domino',
        description: 'P2P voice domino table with spatial audio and a deterministic core.',
        theme_color: '#0b1120',
        background_color: '#0b1120',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:8787', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vite 8 bundles rolldown, whose manualChunks is function-only;
        // codeSplitting.groups is the declarative replacement.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'pixi', test: /node_modules[\\/]pixi\.js[\\/]/ },
            { name: 'physics', test: /node_modules[\\/]matter-js[\\/]/ },
            { name: 'charts', test: /node_modules[\\/]recharts[\\/]/ },
            { name: 'ai', test: /node_modules[\\/]@tensorflow[\\/]/ },
          ],
        },
      },
    },
  },
});
