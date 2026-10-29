/**
 * Seeds the verified stock list from stocks.json.
 *
 *   pnpm --filter @oxbow/api seed:stocks              check only, prints the review table
 *   pnpm --filter @oxbow/api seed:stocks --write      check, then write to the database
 *   pnpm --filter @oxbow/api seed:stocks --file path  another file (default apps/api/stocks.json)
 *
 * Reads RPC_URL, SOLANA_CLUSTER, JUPITER_API_BASE, PYTH_HERMES_URL and (for
 * --write) DATABASE_URL from the environment or apps/api/.env.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createDb } from '@oxbow/db';
import { connect } from '@oxbow/solana/rpc';
import { fetchJsonSafely } from '@oxbow/solana/safe-fetch';
import { ConfigSchema } from '../src/config';
import { loadEnvFile } from '../src/env-file';
import { LivePrices } from '../src/prices';
import { checkQuotes, checkStocks, jupiterQuote, StocksFileSchema, writeStocks } from '../src/seed';

loadEnvFile();
const args = process.argv.slice(2);
const write = args.includes('--write');
const fileArg = args[args.indexOf('--file') + 1];
const file = args.includes('--file') && fileArg ? resolve(process.cwd(), fileArg) : fileURLToPath(new URL('../stocks.json', import.meta.url));

const config = ConfigSchema.extend({ DATABASE_URL: z.string().optional() }).parse(process.env);

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Can't read ${file}: ${(e as Error).message}\nCopy apps/api/stocks.example.json to apps/api/stocks.json and fill it in.`);
  process.exit(1);
}
const parsed = StocksFileSchema.safeParse(raw);
if (!parsed.success) {
  console.error(`${file} has problems:`);
  for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
const stocksFile = parsed.data;

const deps = {
  rpc: connect(config.RPC_URL, config.SOLANA_CLUSTER),
  prices: new LivePrices(config.JUPITER_API_BASE, config.PYTH_HERMES_URL, (m) => console.warn(m)),
  quote: jupiterQuote(config.JUPITER_API_BASE),
  fetchJson: (u: string) => fetchJsonSafely(u),
  ipfsGateway: config.IPFS_GATEWAY,
};

console.log(`Checking ${stocksFile.stocks.length} stocks on ${config.SOLANA_CLUSTER}${config.RPC_URL ? '' : ' (public RPC; set RPC_URL for production)'}…\n`);
const quotes = await checkQuotes(deps, stocksFile);
const results = await checkStocks(deps, stocksFile);

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
console.table(
  quotes.map((q) => ({ asset: q.kind, mint: q.mint, decimals: q.token?.decimals ?? '-', 'on-chain name': q.token ? cut(`${q.token.name} (${q.token.symbol})`, 30) : '-', result: q.errors.length ? 'ERROR' : 'ok' })),
);
console.table(
  results.map((r) => ({
    symbol: r.entry.symbol,
    mint: r.entry.mint,
    program: r.token?.tokenProgram ?? '-',
    decimals: r.token?.decimals ?? '-',
    'on-chain name': r.token ? cut(`${r.token.name} (${r.token.symbol})`, 30) : '-',
    price: r.priceUsd ? `$${r.priceUsd.toFixed(2)}` : '-',
    [`$1k impact`]: r.impactPct === null ? '-' : `${r.impactPct.toFixed(2)}%`,
    logo: r.entry.logoUri || r.token?.logoUri ? 'yes' : 'tile',
    result: r.errors.length ? 'ERROR (skipped)' : r.failures.length ? 'listed, disabled' : 'verified',
  })),
);
for (const q of quotes) for (const m of [...q.errors, ...q.warnings]) console.log(`  ${q.kind}: ${m}`);
for (const r of results) {
  for (const m of r.errors) console.log(`  ${r.entry.symbol} ERROR: ${m}`);
  for (const m of r.failures) console.log(`  ${r.entry.symbol} disabled: ${m}`);
  for (const m of r.warnings) console.log(`  ${r.entry.symbol} note: ${m}`);
}

if (!write) {
  console.log('\nCheck only. Compare every mint above with the issuer’s official list, then run again with --write.');
  process.exit(0);
}
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const db = createDb(config.DATABASE_URL);
try {
  const { written, disabled } = await writeStocks(db, quotes, results);
  console.log(`\nWrote ${written} stocks and the SOL/USDC quote tokens.${disabled ? ` Disabled ${disabled} stocks no longer in the file.` : ''}`);
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
