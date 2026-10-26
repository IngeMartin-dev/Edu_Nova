import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// GitHub Pages no conoce las rutas de React Router: al recargar /Edu_Nova/students devuelve 404.
// Copiar index.html a 404.html hace que Pages sirva la app y el router resuelva la ruta.
const spaFallback = () => ({
  name: 'spa-404-fallback',
  closeBundle() {
    // Solo en GitHub Pages (VITE_BASE definido). En Cloudflare Pages un 404.html desactivaría
    // el fallback automático a index.html y las rutas dejarían de funcionar al recargar.
    if (process.env.VITE_BASE) copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
  },
});

// En desarrollo (npm run dev) las llamadas /api, /img y /uploads van al Express (8080).
// En producción Express sirve este mismo build desde backend/public.
export default defineConfig({
  // VITE_BASE=/Edu_Nova/ para GitHub Pages; '/' (por defecto) en local y cuando Express sirve el build.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), spaFallback()],
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
