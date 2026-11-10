import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Небольшой набор тестов: 16 воркеров только замедляют старт на CI.
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/**/*.{ts,tsx}'],
      exclude: [
        'src/lib/**/*.test.*',
        // Демо-фикстуры: данные для demo-режима, тестировать их бессмысленно.
        'src/lib/demo-*.ts',
      ],
      thresholds: {
        // Ratchet: порог — фактическое покрытие, округлённое вниз. При росте
        // покрытия порог поднимается в том же коммите, чтобы оно не откатилось.
        lines: 84,
        statements: 81,
        branches: 77,
        functions: 81.5,
      },
    },
  },
});
