import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Binance USDT-M futures API එකට browser එකෙන් කෙලින්ම call කරනවා
 * වෙනුවට dev වලදී මේ vite proxy එකෙන් යවනවා —
 * /fapi/* => https://fapi.binance.com/fapi/*
 * (CORS/region අවුල් මගහරින්න. Production වලදී මේම path එකම
 * apps2/server proxy එකෙන් handle වෙනවා.)
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
      },
    },
  },
});
