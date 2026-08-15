import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['pos-icon.svg'],
    manifest: {
      name: 'KroniqOS',
      short_name: 'KroniqOS',
      description: 'Offline-first supermarket point of sale',
      theme_color: '#167843',
      background_color: '#f5f7f3',
      display: 'standalone',
      start_url: '/',
      icons: [{ src: 'pos-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    },
    workbox: {
      navigateFallback: '/index.html',
      globPatterns: ['**/*.{js,css,html,svg,png,ico}']
    }
  })]
})
