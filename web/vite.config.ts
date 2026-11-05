import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/wardrobe-coo/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['dm-serif-display.ttf', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wardrobe COO',
        short_name: 'Wardrobe',
        description: 'One outfit a day, one tap.',
        start_url: '/wardrobe-coo/',
        scope: '/wardrobe-coo/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0D235A',
        theme_color: '#F7F3EA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ttf}'],
        navigateFallback: '/wardrobe-coo/index.html',
      },
    }),
  ],
  build: { target: 'es2022', cssCodeSplit: false, modulePreload: false },
  test: { environment: 'node' },
})
