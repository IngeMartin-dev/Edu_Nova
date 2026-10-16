import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo (npm run dev) las llamadas /api, /img y /uploads van al Express (8080).
// En producción Express sirve este mismo build desde backend/public.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      '/api': 'http://localhost:8080',
      '/img': 'http://localhost:8080',
      '/uploads': 'http://localhost:8080',
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
