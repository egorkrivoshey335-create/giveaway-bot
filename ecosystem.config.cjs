// PM2 конфигурация для production
// Используем node --import tsx вместо прямого вызова tsx
// чтобы избежать проблем с pnpm симлинками

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      env: {
        NODE_ENV: 'production',
      },
      // Перезапуск при падении
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'bot',
      cwd: './apps/bot',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'site',
      cwd: './apps/site',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
