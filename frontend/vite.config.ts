import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Sin esto, Node puede resolver "localhost" solo a IPv6 (::1) en algunas
    // máquinas Windows y el navegador (que prueba 127.0.0.1) recibe
    // ERR_CONNECTION_REFUSED aunque el servidor esté "ready". Se fija la IPv4
    // de loopback explícitamente para evitar la ambigüedad.
    host: '127.0.0.1',
    port: 5173,
    open: true,
  },
});
