import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 3001}`, changeOrigin: false },
      '/socket': {
        target: `ws://127.0.0.1:${process.env.API_PORT || 3001}`,
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'game' : undefined) },
    },
  },
});
