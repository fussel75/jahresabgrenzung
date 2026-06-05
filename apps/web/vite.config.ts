import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend wird im Dev über den Vite-Proxy an die API angebunden.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
