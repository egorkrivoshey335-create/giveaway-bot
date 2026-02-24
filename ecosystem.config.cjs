// PM2 конфигурация для production
// Используем node_modules/.bin/tsx — symlink, работает с любой версией tsx

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: '../../node_modules/.bin/tsx',
      args: 'src/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'bot',
      cwd: './apps/bot',
      script: '../../node_modules/.bin/tsx',
      args: 'src/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
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
      restart_delay: 3000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
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
      restart_delay: 3000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

// =============================================================================
// После деплоя выполнить:
//
// pm2 startup          # настроить автозапуск (выполнить команду которую выведет)
// pm2 save             # сохранить список процессов
//
// pm2-logrotate (ротация логов, важно для prod):
// pm2 install pm2-logrotate
// pm2 set pm2-logrotate:max_size 100M
// pm2 set pm2-logrotate:retain 7
// pm2 set pm2-logrotate:compress true
// =============================================================================
