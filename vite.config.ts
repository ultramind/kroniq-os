import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['pos-icon.svg'],
    manifest: {
      name: 'Kroniqos',
      short_name: 'Kroniqos',
      description: 'Offline-first supermarket point of sale',
      theme_color: '#167843',
      background_color: '#f5f7f3',
      display: 'standalone',
      start_url: '/',
      icons: [{ src: 'pos-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    },
    workbox: {
      navigateFallback: '/index.html',
      globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      // Keep the main application shell available for the offline-first checkout.
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    }
  })]
})
