// PM2 process file for the web app on the VPS.
//   pm2 start infra/ecosystem.config.cjs    (first time)
//   bash infra/deploy.sh                    (updates)
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'oxbow-web',
      cwd: path.join(__dirname, '..', 'apps', 'web'),
      script: 'node_modules/next/dist/bin/next',
      // Listen on localhost only; Nginx is the public entry point.
      args: 'start -H 127.0.0.1 -p 3000',
      env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      max_memory_restart: '800M',
      time: true,
    },
  ],
};
