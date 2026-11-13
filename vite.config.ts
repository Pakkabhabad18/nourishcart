import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE lets the same build run at a domain root (Cloudflare Pages) or under a
// sub-path (review previews). VITE_ROUTER_MODE=hash is used for sub-path previews.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // New deploys take over straight away; there is no update prompt in the UI.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'NourishCart',
        short_name: 'NourishCart',
        description: 'Personal nutrition, meal planning and grocery planning for Indian homes.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#F7F6FB',
        theme_color: '#4A2A6B',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Static app shell only. Supabase API/auth/function responses are never cached
        // (they carry private profile, nutrition, basket and order data).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/functions/],
        runtimeCaching: [],
      },
    }),
  ],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
});
