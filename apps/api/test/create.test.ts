/**
 * Pool creation end to end against a simulated chain: build the transaction,
 * "confirm" it (the fake RPC replays the built message as the confirmed
 * transaction and creates the accounts Raydium would), register, burn the LP
 * and record the burn. Account data uses the real layouts (SPL Token, Raydium
 * SDK), so the server parses exactly what it would read on mainnet.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type AccountInfo } from '@solana/web3.js';
import { ACCOUNT_SIZE, AccountLayout, getAssociatedTokenAddressSync, MINT_SIZE, MintLayout, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { Redis } from 'ioredis';
import { CpmmConfigInfoLayout, CpmmPoolInfoLayout, getCpmmPdaAmmConfigId } from '@raydium-io/raydium-sdk-v2';
import { BuiltTxSchema, PoolDetailSchema, VenuesSchema, type ActivityItem } from '@oxbow/shared';
import { createDb, type PrismaClient } from '@oxbow/db';
import { SOL_MINT } from '@oxbow/solana/rpc';
import { CPMM_INITIALIZE, cpmmProgram, orderMints } from '@oxbow/solana/raydium';
import { buildApp, type ChainReader } from '../src/app';
import { ACTIVITY_CHANNEL } from '../src/activity';
import { toRaw } from '../src/create';
import type { PriceRequest, PriceSource } from '../src/prices';
import { makeIds, seedFixtures } from './fixtures';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './global-setup';

const ready = inject('servicesReady');
const NOW = Date.parse('2026-10-28T15:00:00Z');
const { programId } = cpmmProgram('devnet');
const key = () => Keypair.generate().publicKey;
const info = (owner: PublicKey, data: Buffer, lamports = 2_000_000): AccountInfo<Buffer> => ({ owner, data, executable: false, lamports, rentEpoch: 0 });

function mintData(decimals: number) {
  const b = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 10n ** 15n, decimals, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, b);
  return b;
}
function tokenAccountData(mint: PublicKey, owner: PublicKey, amount: bigint) {
  const b = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode(
    { mint, owner, amount, delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default },
    b,
  );
  return b;
}
function configData(index: number, tradeFeeRate: number) {
  const b = Buffer.alloc(CpmmConfigInfoLayout.span);
  CpmmConfigInfoLayout.encode(
    { bump: 1, disableCreatePool: false, index, tradeFeeRate: new BN(tradeFeeRate), protocolFeeRate: new BN(0), fundFeeRate: new BN(0), createPoolFee: new BN(150_000_000), protocolOwner: key(), fundOwner: key(), creatorFeeRate: new BN(0), creatorFeeShareRate: new BN(0) } as never,
    b,
  );
  return b;
}

/** Just enough of a Solana RPC: accounts, balances, a blockhash, simulation, and confirmed transactions. */
class FakeChain {
  accounts = new Map<string, AccountInfo<Buffer>>();
  tokenBalances = new Map<string, { amount: bigint; decimals: number }>();
  lamports = new Map<string, number>();
  txs = new Map<string, unknown>();
  simulateErr: string | null = null;

  set(k: PublicKey | string, a: AccountInfo<Buffer>) {
    this.accounts.set(k.toString(), a);
  }
  async getAccountInfo(k: PublicKey) {
    return this.accounts.get(k.toBase58()) ?? null;
  }
  async getMultipleAccountsInfo(ks: PublicKey[]) {
    return ks.map((k) => this.accounts.get(k.toBase58()) ?? null);
  }
  async getTokenAccountBalance(k: PublicKey) {
    const b = this.tokenBalances.get(k.toBase58());
    if (!b) throw new Error('could not find account');
    return { context: { slot: 1 }, value: { amount: b.amount.toString(), decimals: b.decimals, uiAmount: Number(b.amount) / 10 ** b.decimals, uiAmountString: '' } };
  }
  async getBalance(k: PublicKey) {
    return this.lamports.get(k.toBase58()) ?? 0;
  }
  async getLatestBlockhash() {
    return { blockhash: key().toBase58(), lastValidBlockHeight: 100 };
  }
  async simulateTransaction() {
    return { context: { slot: 1 }, value: { err: this.simulateErr, logs: this.simulateErr ? ['Program log: Error: insufficient funds'] : [] } };
  }
  async getTransaction(sig: string) {
    return this.txs.get(sig) ?? null;
  }
  async getSignatureStatuses(sigs: string[]) {
    return { context: { slot: 1 }, value: sigs.map((s) => (this.txs.has(s) ? { slot: 1, confirmations: null, err: null, confirmationStatus: 'confirmed' } : null)) };
  }
  async getSlot() {
    return 1;
  }
  async getParsedTokenAccountsByOwner() {
    return { context: { slot: 1 }, value: [{ pubkey: key(), account: { data: { parsed: { info: { tokenAmount: { uiAmount: 12.5 } } } } } }] };
  }

  /** Records `bytes` as a confirmed transaction; `paid` is what each account gained. */
  confirm(bytes: Uint8Array, paid: Record<string, number> = {}) {
    const msg = VersionedTransaction.deserialize(bytes).message;
    const keys = msg.staticAccountKeys.map((k) => k.toBase58());
    const pre = keys.map(() => 10_000_000_000);
    const post = keys.map((k, i) => pre[i]! + (paid[k] ?? 0));
    const sig = Buffer.from(Keypair.generate().secretKey).toString('base64url').replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'x').slice(0, 88);
    this.txs.set(sig, { slot: 5, blockTime: Math.floor(NOW / 1000), transaction: { message: msg, signatures: [sig] }, meta: { err: null, fee: 5000, preBalances: pre, postBalances: post, loadedAddresses: { writable: [], readonly: [] } }, version: 0 });
    return sig;
  }

  /** What Raydium's initialize leaves behind: the pool account, its vaults and the creator's LP. */
  createPool(pool: string, creator: PublicKey, configId: string, sides: { mint: string; program: PublicKey; decimals: number; amount: bigint }[]) {
    const [a, b] = orderMints(sides[0]!, sides[1]!);
    const lpMint = key();
    const vaultA = key();
    const vaultB = key();
    const data = Buffer.alloc(CpmmPoolInfoLayout.span);
    CpmmPoolInfoLayout.encode(
      {
        configId: new PublicKey(configId), poolCreator: creator, vaultA, vaultB, mintLp: lpMint, mintA: new PublicKey(a.mint), mintB: new PublicKey(b.mint), mintProgramA: a.program, mintProgramB: b.program, observationId: key(),
        bump: 1, status: 0, lpDecimals: 9, mintDecimalA: a.decimals, mintDecimalB: b.decimals, lpAmount: new BN(1_000_000), protocolFeesMintA: new BN(0), protocolFeesMintB: new BN(0), fundFeesMintA: new BN(0), fundFeesMintB: new BN(0),
        openTime: new BN(0), epoch: new BN(0), feeOn: 0, enableCreatorFee: false, creatorFeesMintA: new BN(0), creatorFeesMintB: new BN(0),
      } as never,
      data,
    );
    this.set(pool, info(programId, data));
    this.set(vaultA, info(a.program, tokenAccountData(new PublicKey(a.mint), key(), a.amount)));
    this.set(vaultB, info(b.program, tokenAccountData(new PublicKey(b.mint), key(), b.amount)));
    this.tokenBalances.set(getAssociatedTokenAddressSync(lpMint, creator).toBase58(), { amount: 999_900n, decimals: 9 });
    return lpMint;
  }
}

class FixedPrices implements PriceSource {
  constructor(private readonly table: Record<string, number>) {}
  async prices(req: PriceRequest[]) {
    return new Map(req.filter((r) => this.table[r.mint]).map((r) => [r.mint, { usd: this.table[r.mint]!, change24h: null, updatedAt: NOW }]));
  }
}

describe('toRaw', () => {
  it('converts UI amounts without floating point, cutting extra decimals', () => {
    expect(toRaw('1500', 6)).toBe(1_500_000_000n);
    expect(toRaw('0.123456789', 6)).toBe(123_456n);
    expect(toRaw('2.5', 9)).toBe(2_500_000_000n);
    expect(toRaw('123456789012345678', 9)).toBe(123456789012345678000000000n);
  });
});

describe.skipIf(!ready)('pool creation', () => {
  const ids = makeIds();
  const { M } = ids;
  const treasury = key().toBase58();
  const creatorKp = Keypair.generate();
  const creator = creatorKp.publicKey;
  const meme = key();
  let db: PrismaClient;
  let redis: Redis;
  let chain: FakeChain;
  let built: Awaited<ReturnType<typeof buildApp>>;
  const post = async (url: string, payload: object) => {
    const r = await built.app.inject({ method: 'POST', url, payload });
    return { status: r.statusCode, body: r.json() as Record<string, unknown> };
  };

  const start = async (treasuryAddr: string | null = treasury) => {
    await built?.app.close();
    built = await buildApp({
      db,
      redis,
      prices: new FixedPrices({ [M.tsla]: 250, [M.nvda]: 140, [SOL_MINT]: 180, [M.usdc]: 1 }),
      rpc: chain as unknown as ChainReader,
      cluster: 'devnet',
      now: () => NOW,
      fetchJson: async () => null,
      create: { treasury: treasuryAddr ?? undefined, feeLamports: 100_000_000n, priorityMicroLamports: 0 },
    });
  };

  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
    await seedFixtures(db, NOW, ids);
  });
  beforeEach(async () => {
    await redis.flushdb();
    chain = new FakeChain();
    // Raydium's fee configs: 1% at index 0, 0.25% at index 1.
    chain.set(getCpmmPdaAmmConfigId(programId, 0).publicKey, info(programId, configData(0, 10_000)));
    chain.set(getCpmmPdaAmmConfigId(programId, 1).publicKey, info(programId, configData(1, 2_500)));
    chain.set(meme, info(TOKEN_PROGRAM_ID, mintData(6)));
    chain.set(M.tsla, info(TOKEN_2022_PROGRAM_ID, mintData(8)));
    chain.set(NATIVE_MINT, info(TOKEN_PROGRAM_ID, mintData(9)));
    chain.lamports.set(creator.toBase58(), 5_000_000_000);
    chain.tokenBalances.set(getAssociatedTokenAddressSync(meme, creator).toBase58(), { amount: 1_000_000_000_000n, decimals: 6 });
    chain.tokenBalances.set(getAssociatedTokenAddressSync(new PublicKey(M.tsla), creator, false, TOKEN_2022_PROGRAM_ID).toBase58(), { amount: 10n * 10n ** 8n, decimals: 8 });
    await start();
  });
  afterAll(async () => {
    await built?.app.close();
    await db?.$disconnect();
    redis?.disconnect();
  });

  const body = (over: object = {}) => ({ creator: creator.toBase58(), baseMint: meme.toBase58(), quoteMint: M.tsla, baseAmount: '1000000', quoteAmount: '4', feeBps: 100, venue: 'RAYDIUM_CPMM', ...over });

  it('lists the fee tiers Raydium offers, and says creation is on', async () => {
    const r = await built.app.inject({ method: 'GET', url: '/api/venues' });
    const v = VenuesSchema.parse(r.json());
    expect(v.createEnabled).toBe(true);
    expect(v.oxbowFeeLamports).toBe(100_000_000);
    expect(v.venues[0]).toEqual({ id: 'RAYDIUM_CPMM', enabled: true, feeTiers: [{ feeBps: 25, createPoolFeeLamports: 150_000_000 }, { feeBps: 100, createPoolFeeLamports: 150_000_000 }] });
  });

  it('is off without a treasury', async () => {
    await start(null);
    expect((await post('/api/pools/build', body())).body).toEqual({ error: 'creation_disabled' });
    expect(VenuesSchema.parse((await built.app.inject({ method: 'GET', url: '/api/venues' })).json()).createEnabled).toBe(false);
  });

  it('builds, registers, burns and records the burn for a memecoin paired with a stock', async () => {
    const res = await post('/api/pools/build', body());
    expect(res.status).toBe(200);
    const b = BuiltTxSchema.parse(res.body);
    const bytes = Buffer.from(b.transaction, 'base64');
    const msg = VersionedTransaction.deserialize(bytes).message;
    expect(msg.staticAccountKeys[0]!.equals(creator)).toBe(true);
    expect(msg.compiledInstructions.some((c) => Buffer.from(c.data).subarray(0, 8).equals(CPMM_INITIALIZE))).toBe(true);
    expect(msg.staticAccountKeys.some((k) => k.toBase58() === treasury)).toBe(true);

    // The wallet signs and sends; the chain now has the pool.
    const lpMint = chain.createPool(b.pool!, creator, getCpmmPdaAmmConfigId(programId, 0).publicKey.toBase58(), [
      { mint: meme.toBase58(), program: TOKEN_PROGRAM_ID, decimals: 6, amount: 1_000_000_000_000n },
      { mint: M.tsla, program: TOKEN_2022_PROGRAM_ID, decimals: 8, amount: 4n * 10n ** 8n },
    ]);
    const sig = chain.confirm(bytes, { [treasury]: 100_000_000 });
    expect((await built.app.inject({ method: 'GET', url: `/api/tx/${sig}` })).json()).toEqual({ status: 'confirmed' });

    const sub = redis.duplicate();
    const published: ActivityItem[] = [];
    await sub.subscribe(ACTIVITY_CHANNEL);
    sub.on('message', (_c, m: string) => published.push(JSON.parse(m) as ActivityItem));

    const reg = await post('/api/pools/register', { signature: sig, venue: 'RAYDIUM_CPMM' });
    expect(reg.status).toBe(200);
    const pool = PoolDetailSchema.parse(reg.body);
    expect(pool).toMatchObject({ address: b.pool, creator: creator.toBase58(), feeBps: 100, createdTx: sig, lpMint: lpMint.toBase58(), lp: { status: 'UNLOCKED' } });
    expect(pool.quote.symbol).toBe('TSLAx');
    expect(pool.reserveBase).toBe(1_000_000);
    expect(pool.reserveQuote).toBe(4);
    expect(pool.priceUsd).toBeCloseTo((4 / 1_000_000) * 250);
    expect(pool.tvlUsd).toBeCloseTo(2000);
    expect(pool.holders).toEqual([{ kind: 'CREATOR', pct: 100, unlockAt: null, proof: { kind: 'account', id: getAssociatedTokenAddressSync(lpMint, creator).toBase58() } }]);
    // Registering again is harmless.
    expect((await post('/api/pools/register', { signature: sig, venue: 'RAYDIUM_CPMM' })).status).toBe(200);
    // Listed straight away, and announced on the live feed.
    const list = (await built.app.inject({ method: 'GET', url: '/api/pools?q=' + b.pool })).json() as { items: { address: string }[] };
    expect(list.items.map((p) => p.address)).toEqual([b.pool]);
    await new Promise((r) => setTimeout(r, 100));
    expect(published.map((p) => p.kind)).toEqual(['POOL']);
    await sub.quit();

    // Burn the LP.
    expect((await post(`/api/pools/${b.pool}/burn`, { creator: key().toBase58() })).body).toEqual({ error: 'not_creator' });
    const burn = BuiltTxSchema.parse((await post(`/api/pools/${b.pool}/burn`, { creator: creator.toBase58() })).body);
    const burnSig = chain.confirm(Buffer.from(burn.transaction, 'base64'));
    chain.tokenBalances.set(getAssociatedTokenAddressSync(lpMint, creator).toBase58(), { amount: 0n, decimals: 9 });
    const locked = PoolDetailSchema.parse((await post(`/api/pools/${b.pool}/lock`, { signature: burnSig })).body);
    expect(locked.lp).toEqual({ status: 'BURNED', lockedPct: 100, unlockAt: null });
    expect(locked.holders).toEqual([{ kind: 'BURNED', pct: 100, unlockAt: null, proof: { kind: 'tx', id: burnSig } }]);
  });

  it('wraps SOL when SOL is the pair asset', async () => {
    const res = await post('/api/pools/build', body({ quoteMint: SOL_MINT, quoteAmount: '1.5', feeBps: 25 }));
    expect(res.status).toBe(200);
    const msg = VersionedTransaction.deserialize(Buffer.from(BuiltTxSchema.parse(res.body).transaction, 'base64')).message;
    expect(msg.staticAccountKeys.some((k) => k.equals(getAssociatedTokenAddressSync(NATIVE_MINT, creator)))).toBe(true);
  });

  it('refuses what would fail on chain, before the wallet sees it', async () => {
    expect((await post('/api/pools/build', body({ feeBps: 200 }))).body).toEqual({ error: 'fee_tier_unavailable' });
    expect((await post('/api/pools/build', body({ quoteMint: key().toBase58() }))).body).toEqual({ error: 'quote_not_listed' });
    expect((await post('/api/pools/build', body({ quoteAmount: '11' }))).body).toEqual({ error: 'insufficient_token', mint: M.tsla });
    chain.lamports.set(creator.toBase58(), 100_000_000);
    expect((await post('/api/pools/build', body())).body).toMatchObject({ error: 'insufficient_sol', needSol: 0.3 });
    chain.lamports.set(creator.toBase58(), 5_000_000_000);
    chain.simulateErr = 'InstructionError';
    expect((await post('/api/pools/build', body())).body).toEqual({ error: 'simulation_failed', detail: 'Program log: Error: insufficient funds' });
    chain.simulateErr = null;
    const ok = BuiltTxSchema.parse((await post('/api/pools/build', body())).body);
    chain.set(ok.pool!, info(programId, Buffer.alloc(8)));
    expect((await post('/api/pools/build', body())).body).toEqual({ error: 'pool_exists', pool: ok.pool });
  });

  it('only lists pools whose transaction paid the Oxbow fee and created a Raydium pool', async () => {
    const b = BuiltTxSchema.parse((await post('/api/pools/build', body({ feeBps: 25 }))).body);
    const bytes = Buffer.from(b.transaction, 'base64');
    chain.createPool(b.pool!, creator, getCpmmPdaAmmConfigId(programId, 1).publicKey.toBase58(), [
      { mint: meme.toBase58(), program: TOKEN_PROGRAM_ID, decimals: 6, amount: 5n },
      { mint: M.tsla, program: TOKEN_2022_PROGRAM_ID, decimals: 8, amount: 5n },
    ]);
    expect((await post('/api/pools/register', { signature: chain.confirm(bytes), venue: 'RAYDIUM_CPMM' })).body).toEqual({ error: 'fee_missing' });

    const plain = new TransactionMessage({ payerKey: creator, recentBlockhash: key().toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: creator, toPubkey: new PublicKey(treasury), lamports: 100_000_000 })] }).compileToV0Message();
    const plainSig = chain.confirm(new VersionedTransaction(plain).serialize(), { [treasury]: 100_000_000 });
    expect((await post('/api/pools/register', { signature: plainSig, venue: 'RAYDIUM_CPMM' })).body).toEqual({ error: 'not_a_pool_creation' });
  });

  it('reads wallet balances for SOL and tokens', async () => {
    const r = await built.app.inject({ method: 'GET', url: `/api/wallet/${creator.toBase58()}/balances?mints=${SOL_MINT},${meme.toBase58()}` });
    expect(r.json()).toEqual({ [SOL_MINT]: 5, [meme.toBase58()]: 12.5 });
  });
});

