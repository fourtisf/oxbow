// PM2 processes on the VPS.
//   pm2 start infra/ecosystem.config.cjs    (first time)
//   bash infra/deploy.sh                    (updates)
// The API and the tracker worker run once apps/api/.env exists (infra/setup-data.sh writes it).
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const hasApiEnv = fs.existsSync(path.join(root, 'apps', 'api', '.env'));

module.exports = {
  apps: [
    {
      name: 'oxbow-web',
      cwd: path.join(root, 'apps', 'web'),
      script: 'node_modules/next/dist/bin/next',
      // Listen on localhost only; Nginx is the public entry point.
      args: 'start -H 127.0.0.1 -p 3000',
      env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      max_memory_restart: '800M',
      time: true,
    },
    ...(hasApiEnv
      ? [
          {
            name: 'oxbow-api',
            cwd: path.join(root, 'apps', 'api'),
            // TypeScript through tsx, like the workspace packages it imports. Reads apps/api/.env itself.
            script: 'src/index.ts',
            interpreter: 'node',
            node_args: '--import tsx',
            env: { NODE_ENV: 'production' },
            max_memory_restart: '400M',
            time: true,
          },
          {
            // Follows tracked wallets on chain (websocket + catch-up) and stores their trades.
            name: 'oxbow-worker',
            cwd: path.join(root, 'apps', 'api'),
            script: 'src/worker.ts',
            interpreter: 'node',
            node_args: '--import tsx',
            env: { NODE_ENV: 'production' },
            max_memory_restart: '400M',
            restart_delay: 5000,
            time: true,
          },
        ]
      : []),
  ],
};
