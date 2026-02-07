// PM2 конфигурация для production
// Путь к tsx CLI через pnpm store (избегает проблемы с симлинками)

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      // Прямой путь к tsx CLI (найден через: pnpm --filter api exec which tsx)
      script: '/opt/randombeast/app/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs',
      args: 'src/server.ts',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'bot',
      cwd: './apps/bot',
      script: '/opt/randombeast/app/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs',
      args: 'src/server.ts',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'site',
      cwd: './apps/site',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3001',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
