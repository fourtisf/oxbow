/**
 * End-to-end pool creation on devnet, with a throwaway wallet: airdrop, make
 * a test token, then build -> sign -> send -> register -> burn -> lock through
 * a running API, exactly the calls the web app makes.
 *
 * Needs an API started for devnet against a *_test database, e.g.
 *   SOLANA_CLUSTER=devnet OXBOW_TREASURY=<any devnet address> \
 *   DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test node --import tsx src/index.ts
 * then:
 *   DATABASE_URL=postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test pnpm --filter @oxbow/api devnet:create
 * Optional: RPC_URL (devnet), API_URL (default http://127.0.0.1:4000).
 */
import { clusterApiUrl, Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, NATIVE_MINT } from '@solana/spl-token';
import { createDb } from '@oxbow/db';
import { BuiltTxSchema, PoolDetailSchema, VenuesSchema } from '@oxbow/shared';
import type { z } from 'zod';

const API = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const dbUrl = process.env.DATABASE_URL ?? '';
if (!new URL(dbUrl || 'postgresql://x/none').pathname.endsWith('_test')) {
  console.error('Use a *_test database (DATABASE_URL).');
  process.exit(1);
}
const conn = new Connection(process.env.RPC_URL || clusterApiUrl('devnet'), 'confirmed');
const payer = Keypair.generate();

async function api<S extends z.ZodTypeAny>(path: string, schema: S, body?: unknown): Promise<z.output<S>> {
  const res = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(json)}`);
  return schema.parse(json);
}

async function signSend(b64: string): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  tx.sign([payer]);
  const sig = await conn.sendTransaction(tx);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  return sig;
}

const step = (s: string) => console.log(`\n> ${s}`);

step(`Wallet ${payer.publicKey.toBase58()}: airdrop 2 SOL`);
for (let i = 0; ; i++) {
  try {
    const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    break;
  } catch (e) {
    if (i >= 4) throw new Error(`Airdrop failed (devnet faucet limits): ${(e as Error).message}`);
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
}

step('Test token: 1,000,000,000 TEST to the wallet');
const mint = await createMint(conn, payer, payer.publicKey, null, 6);
const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
await mintTo(conn, payer, mint, ata.address, payer, 1_000_000_000n * 10n ** 6n);

step('SOL as a pair asset in the test database');
const db = createDb(dbUrl);
await db.quoteToken.upsert({ where: { kind: 'SOL' }, create: { mint: NATIVE_MINT.toBase58(), kind: 'SOL', symbol: 'SOL', name: 'Solana', decimals: 9 }, update: { mint: NATIVE_MINT.toBase58() } });
await db.$disconnect();

const venues = await api('/api/venues', VenuesSchema);
const tier = venues.venues.find((v) => v.id === 'RAYDIUM_CPMM')?.feeTiers.at(-1);
if (!venues.createEnabled || !tier) throw new Error(`Creation is off: ${JSON.stringify(venues)}`);

step(`Build: 1,000,000 TEST + 0.5 SOL at ${tier.feeBps / 100}%`);
const built = await api('/api/pools/build', BuiltTxSchema, {
  creator: payer.publicKey.toBase58(),
  baseMint: mint.toBase58(),
  quoteMint: NATIVE_MINT.toBase58(),
  baseAmount: '1000000',
  quoteAmount: '0.5',
  feeBps: tier.feeBps,
  venue: 'RAYDIUM_CPMM',
});
const sig = await signSend(built.transaction);
console.log(`  created: ${sig}`);

step('Register');
const pool = await api('/api/pools/register', PoolDetailSchema, { signature: sig, venue: 'RAYDIUM_CPMM' });
console.log(`  pool ${pool.address}: ${pool.base.symbol}/${pool.quote.symbol}, ${pool.reserveBase} / ${pool.reserveQuote}, TVL $${pool.tvlUsd.toFixed(2)}`);

step('Burn the LP and record it');
const burn = await api(`/api/pools/${pool.address}/burn`, BuiltTxSchema, { creator: payer.publicKey.toBase58() });
const burnSig = await signSend(burn.transaction);
const locked = await api(`/api/pools/${pool.address}/lock`, PoolDetailSchema, { signature: burnSig });
console.log(`  LP: ${locked.lp.status} ${locked.lp.lockedPct}%`);
if (locked.lp.status !== 'BURNED') throw new Error('LP not burned');
console.log('\nDevnet pool creation works end to end.');
