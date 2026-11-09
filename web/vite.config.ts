import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Корневой .env содержит реальный WEB_PORT бота (по умолчанию 8080).
  // Без этого dev-прокси уходил на 3000 и панель в dev-режиме не видела API.
  const rootEnv = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  const botPort = rootEnv.WEB_PORT || env.WEB_PORT || '3000';
  const botOrigin = env.BOT_API_ORIGIN || rootEnv.BOT_API_ORIGIN || `http://127.0.0.1:${botPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // В dev-режиме API и OAuth живут на существующем сервере бота.
        '/api': {
          target: botOrigin,
          changeOrigin: true,
        },
        '/auth': {
          target: botOrigin,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Стабильные vendor-чанки лучше кешируются, а основной бандл
          // остаётся меньше 500 КБ. Recharts по-прежнему lazy-load.
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'motion-vendor': ['framer-motion'],
            'data-vendor': ['@tanstack/react-query', 'zustand'],
          },
        },
      },
    },
  };
});
