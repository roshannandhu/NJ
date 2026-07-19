import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    cssTarget: 'chrome61',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://18.61.159.169:8000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://18.61.159.169:8000',
        changeOrigin: true
      }
    }
  }
})
