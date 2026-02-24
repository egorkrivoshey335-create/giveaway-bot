import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/utils/**/*.ts', 'src/routes/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
    // Не загружаем реальный .env в тестах
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test_secret_at_least_32_characters_long_for_tests',
    },
  },
});
