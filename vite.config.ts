import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev වලදී proxy දෙකක්:
 *
 *  - `/fapi/*` => https://fapi.binance.com/fapi/*
 *    Binance එකට browser එකෙන් කෙලින්ම call කරන එකේ CORS/region අවුල්
 *    මගහරින්න. (Production වලදී මේම path එකම apps2/server එකෙන් handle
 *    වෙනවා, Redis cache එකකුත් එක්ක.)
 *
 *  - `/api/*` => apps2/server (Postgres backed candles).
 *    Server එක දුවනවා නම් candles DB එකෙන් එනවා — Binance එකට request
 *    එකක්වත් යන්නේ නෑ. දුවන්නේ නැත්නම් මේ proxy එක fail වෙනවා, client එක
 *    ඒක අඳුරගෙන ආපහු `/fapi` පාරෙන් යනවා (src/lib/binance.ts බලන්න).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      // Live data — server එකේ WebSocket එක. `ws: true` නැතුව vite
      // upgrade request එක forward කරන්නේ නෑ.
      '/ws': {
        target: 'ws://127.0.0.1:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
