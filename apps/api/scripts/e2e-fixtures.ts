/**
 * Loads the test fixtures into a *_test database for the web app's live-data
 * end-to-end tests. Wipes the Oxbow tables first, so it refuses any database
 * whose name doesn't end in "_test".
 *
 *   DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test pnpm --filter @oxbow/api e2e:fixtures
 */
import { createDb } from '@oxbow/db';
import { seedFixtures } from '../test/fixtures';

const url = process.env.DATABASE_URL ?? '';
const name = url ? new URL(url).pathname.slice(1) : '';
if (!name.endsWith('_test')) {
  console.error(`Refusing to wipe "${name || '(no DATABASE_URL)'}": only databases ending in _test.`);
  process.exit(1);
}
const db = createDb(url);
const now = Date.now();
const ids = await seedFixtures(db, now);
// Recent stock prices, so pages have prices without reaching the price APIs.
await db.stockSnapshot.createMany({
  data: [
    { mint: ids.M.tsla, ts: new Date(now - 60_000), priceUsd: 431.5 },
    { mint: ids.M.nvda, ts: new Date(now - 60_000), priceUsd: 192.6 },
  ],
});
await db.$disconnect();
console.log(JSON.stringify(ids));
