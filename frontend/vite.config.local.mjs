// Dev-only Vite config for UI work. Identical to vite.config.js except the API
// proxy points at a LOCAL backend instead of the production EC2 box, so driving
// the UI in a browser can never create or edit real quotations. Not used by any
// build; `vite.config.js` remains the real one.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
