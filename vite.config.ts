import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Coinbase International Exchange API එකේ CORS header නැති නිසා browser
 * එකෙන් කෙලින්ම call කරන්න බෑ. ඒ නිසා dev වලදී මේ vite proxy එකෙන්
 * /intx/* => https://api.international.coinbase.com/api/v1/* යවනවා.
 * (Production වලදී මේම path එකම apps2/server proxy එකෙන් handle වෙනවා.)
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/intx': {
        target: 'https://api.international.coinbase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/intx/, '/api/v1'),
      },
    },
  },
});
