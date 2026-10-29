import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Only migrations need the URL; `prisma generate` runs without one (fresh installs, CI).
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
