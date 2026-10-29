/**
 * Pool creation (M3, Raydium CPMM). The server builds the unsigned
 * transaction; the creator signs it in their own wallet; then the server
 * reads the confirmed transaction from the chain and lists the pool. Nothing
 * about a pool is ever taken from the client: register only needs the
 * signature, and every fact comes from the chain.
 *
 * Creation stays off (503 creation_disabled) until OXBOW_TREASURY is set.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount, unpackMint } from '@solana/spl-token';
import {
  AddressSchema,
  BuildCreateBodySchema,
  BurnBuildBodySchema,
  LockPoolBodySchema,
  RegisterPoolBodySchema,
  SendTxBodySchema,
  type ActivityItem,
  type BuiltTx,
  type HolderSlice,
  type QuoteAsset,
  type TxStatus,
  type Venues,
} from '@oxbow/shared';
import type { Prisma, PrismaClient } from '@oxbow/db';
import { lookupToken } from '@oxbow/solana/token';
import { SOL_MINT, type Cluster } from '@oxbow/solana/rpc';
import {
  buildBurnLpTx,
  buildCreatePoolTx,
  cpmmConfigFeeBps,
  CPMM_INITIALIZE,
  cpmmProgram,
  decodeCpmmPool,
  poolAddress,
  readCpmmConfigs,
  supportMintAccounts,
} from '@oxbow/solana/raydium';
import type { ActivityHub } from './activity';
import type { ChainReader } from './app';
import type { Cache } from './cache';
import { HttpError, priv, pub, withTimeout } from './http';
import { assetRef, type Market } from './market';

export interface CreateConfig {
  /** Where the Oxbow fee goes. Unset: creation is off. */
  treasury?: string;
  feeLamports: bigint;
  /** Priority fee for the create transaction, micro-lamports per compute unit. */
  priorityMicroLamports: number;
}

interface Ctx {
  db: PrismaClient;
  rpc: ChainReader;
  cluster: Cluster;
  cache: Cache;
  market: Market;
  hub: ActivityHub;
  now: () => number;
  config?: CreateConfig;
  fetchJson: (url: string) => Promise<unknown | null>;
  ipfsGateway?: string;
}

/** Rent for the pool's new accounts plus slack, so a creation never fails halfway on SOL. */
const RENT_BUFFER_LAMPORTS = 50_000_000n;
const RPC_MS = 12_000;
const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

/** "1500.25" in UI units to raw base units; extra decimals are cut, never rounded up. */
export function toRaw(ui: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(ui.trim());
  if (!m) throw new HttpError(400, 'bad_amount');
  return BigInt(m[1]! + (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0'));
}

const uiAmount = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;
const programName = (owner: PublicKey): 'spl-token' | 'token-2022' | null => (owner.equals(TOKEN_2022_PROGRAM_ID) ? 'token-2022' : owner.equals(TOKEN_PROGRAM_ID) ? 'spl-token' : null);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** Which side of a pair is the pair asset: a stock beats USDC beats SOL. */
function quoteRank(a: QuoteAsset | undefined): number {
  return !a ? -1 : a.kind === 'STOCK' ? 3 : a.kind === 'USDC' ? 2 : 1;
}

export function registerCreateRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, rpc, cluster, cache, market } = ctx;
  const enabled = () => !!ctx.config?.treasury;

  /** Raydium's fee configs, cached (they change rarely). */
  const configs = () =>
    cache.wrap('cpmm-configs:v1', 600, async () =>
      (await withTimeout(readCpmmConfigs(rpc, cluster), RPC_MS)).map((c) => ({ ...c, createPoolFeeLamports: Number(c.createPoolFeeLamports) })),
    );

  // ---------------------------------------------------------------- venues

  app.get('/api/venues', async (_req, reply): Promise<Venues> => {
    let tiers: Venues['venues'][number]['feeTiers'] = [];
    try {
      tiers = (await configs()).map((c) => ({ feeBps: c.feeBps, createPoolFeeLamports: c.createPoolFeeLamports }));
    } catch {
      // RPC down: Raydium shows no tiers until it answers
    }
    pub(reply, 60);
    return {
      createEnabled: enabled() && tiers.length > 0,
      oxbowFeeLamports: Number(ctx.config?.feeLamports ?? 0n),
      venues: [
        { id: 'RAYDIUM_CPMM', enabled: tiers.length > 0, feeTiers: tiers },
        // Meteora and Orca arrive with M4.
        { id: 'METEORA_DAMM_V2', enabled: false, feeTiers: [] },
        { id: 'ORCA_WHIRLPOOL', enabled: false, feeTiers: [] },
      ],
    };
  });

  // ---------------------------------------------------------------- build

  app.post('/api/pools/build', strict, async (req, reply): Promise<BuiltTx> => {
    const body = BuildCreateBodySchema.parse(req.body);
    priv(reply);
    if (!enabled()) throw new HttpError(503, 'creation_disabled');
    if (body.venue !== 'RAYDIUM_CPMM') throw new HttpError(400, 'venue_unavailable');
    if (body.baseMint === body.quoteMint) throw new HttpError(400, 'same_mint');

    const book = await market.quoteBook();
    const quote = book.assets[body.quoteMint];
    if (!quote) throw new HttpError(400, 'quote_not_listed');
    if (!(quote.priceUsd > 0)) throw new HttpError(409, 'price_unavailable');

    const tier = (await configs()).find((c) => c.feeBps === body.feeBps);
    if (!tier) throw new HttpError(400, 'fee_tier_unavailable');

    const creator = new PublicKey(body.creator);
    const [baseAcc, quoteAcc] = await withTimeout(rpc.getMultipleAccountsInfo([new PublicKey(body.baseMint), new PublicKey(body.quoteMint)]), RPC_MS);
    const side = (mint: string, acc: typeof baseAcc) => {
      const program = acc && programName(acc.owner);
      if (!acc || !program) throw new HttpError(400, 'not_a_mint', { mint });
      const m = unpackMint(new PublicKey(mint), acc, acc.owner);
      return { mint, tokenProgram: program, decimals: m.decimals };
    };
    const base = side(body.baseMint, baseAcc);
    const q = side(body.quoteMint, quoteAcc);
    const baseRaw = toRaw(body.baseAmount, base.decimals);
    const quoteRaw = toRaw(body.quoteAmount, q.decimals);
    if (baseRaw <= 0n || quoteRaw <= 0n) throw new HttpError(400, 'zero_amount');

    // The stock's own minimum liquidity, set in the seed file.
    if (quote.kind === 'STOCK') {
      const stock = await db.stockAsset.findUnique({ where: { mint: quote.mint }, select: { minLiquidityUsd: true } });
      const min = stock ? stock.minLiquidityUsd.toNumber() : 0;
      if (min > 0 && uiAmount(quoteRaw, q.decimals) * quote.priceUsd * 2 < min) throw new HttpError(400, 'below_min_liquidity', { minUsd: min });
    }

    const { pool } = poolAddress(cluster, tier.id, base.mint, q.mint);
    const exists = await withTimeout(rpc.getMultipleAccountsInfo([new PublicKey(pool)]), RPC_MS);
    if (exists[0]) throw new HttpError(409, 'pool_exists', { pool });

    // Balances first, so the wallet never shows a transaction that can't succeed.
    const fee = ctx.config!.feeLamports;
    let needLamports = BigInt(tier.createPoolFeeLamports) + fee + RENT_BUFFER_LAMPORTS;
    for (const s of [
      { ...base, raw: baseRaw },
      { ...q, raw: quoteRaw },
    ]) {
      if (s.mint === SOL_MINT) {
        needLamports += s.raw;
        continue;
      }
      const ata = getAssociatedTokenAddressSync(new PublicKey(s.mint), creator, false, s.tokenProgram === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
      const held = await withTimeout(rpc.getTokenAccountBalance(ata), RPC_MS).then(
        (r) => BigInt(r.value.amount),
        () => 0n,
      );
      if (held < s.raw) throw new HttpError(400, 'insufficient_token', { mint: s.mint });
    }
    const lamports = BigInt(await withTimeout(rpc.getBalance(creator), RPC_MS));
    if (lamports < needLamports) throw new HttpError(400, 'insufficient_sol', { needSol: Number(needLamports) / 1e9 });

    const supports = supportMintAccounts(cluster, [
      { mint: base.mint, tokenProgram: base.tokenProgram, amount: baseRaw },
      { mint: q.mint, tokenProgram: q.tokenProgram, amount: quoteRaw },
    ]);
    const supportInfo = supports.length ? await withTimeout(rpc.getMultipleAccountsInfo(supports.map((s) => s.account)), RPC_MS) : [];
    const { blockhash } = await withTimeout(rpc.getLatestBlockhash('confirmed'), RPC_MS);

    const built = buildCreatePoolTx({
      cluster,
      creator: body.creator,
      base: { mint: base.mint, tokenProgram: base.tokenProgram, amount: baseRaw },
      quote: { mint: q.mint, tokenProgram: q.tokenProgram, amount: quoteRaw },
      config: { ...tier, createPoolFeeLamports: BigInt(tier.createPoolFeeLamports) },
      oxbowFee: { treasury: ctx.config!.treasury!, lamports: fee },
      recentBlockhash: blockhash,
      supportedMintExt: supports.filter((_, i) => !!supportInfo[i]).map((s) => s.mint),
      priorityMicroLamports: ctx.config!.priorityMicroLamports,
    });

    // Dry run: catches what the balance checks can't (unsupported Token-2022 extensions, frozen accounts).
    const sim = await withTimeout(
      rpc.simulateTransaction(VersionedTransaction.deserialize(built.transaction), { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }),
      RPC_MS,
    );
    if (sim.value.err) {
      const line = (sim.value.logs ?? []).filter((l) => /error|failed|insufficient/i.test(l)).at(-1) ?? JSON.stringify(sim.value.err);
      req.log.warn({ pool, err: sim.value.err }, 'create simulation failed');
      throw new HttpError(400, 'simulation_failed', { detail: line.slice(0, 200) });
    }
    return { transaction: b64(built.transaction), pool: built.pool };
  });

  // ---------------------------------------------------------------- send / status

  app.post('/api/tx/send', strict, async (req, reply) => {
    const { transaction } = SendTxBodySchema.parse(req.body);
    priv(reply);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(transaction, 'base64');
      VersionedTransaction.deserialize(bytes);
    } catch {
      throw new HttpError(400, 'bad_transaction');
    }
    try {
      const signature = await withTimeout(rpc.sendRawTransaction(bytes, { skipPreflight: false, maxRetries: 3 }), RPC_MS);
      return { signature };
    } catch (e) {
      throw new HttpError(400, 'send_failed', { detail: (e as Error).message.slice(0, 200) });
    }
  });

  app.get('/api/tx/:signature', async (req, reply): Promise<TxStatus> => {
    const { signature } = z.object({ signature: RegisterPoolBodySchema.shape.signature }).parse(req.params);
    priv(reply);
    const { value } = await withTimeout(rpc.getSignatureStatuses([signature]), RPC_MS);
    const s = value[0];
    if (!s) return { status: 'pending' };
    if (s.err) return { status: 'failed' };
    return { status: s.confirmationStatus === 'processed' ? 'pending' : 'confirmed' };
  });

  // ---------------------------------------------------------------- register

  app.post('/api/pools/register', strict, async (req, reply) => {
    const { signature, venue } = RegisterPoolBodySchema.parse(req.body);
    priv(reply);
    if (venue !== 'RAYDIUM_CPMM') throw new HttpError(400, 'venue_unavailable');

    const known = await db.pool.findFirst({ where: { createdTx: signature }, select: { address: true } });
    if (known) return market.pool(known.address);

    const tx = await withTimeout(rpc.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }), RPC_MS);
    if (!tx || !tx.meta) throw new HttpError(409, 'not_confirmed');
    if (tx.meta.err) throw new HttpError(400, 'tx_failed');

    const msg = tx.transaction.message;
    const keys = [...msg.staticAccountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
    const { programId } = cpmmProgram(cluster);
    const init = msg.compiledInstructions.find((c) => keys[c.programIdIndex]?.equals(programId) && Buffer.from(c.data).subarray(0, 8).equals(CPMM_INITIALIZE));
    if (!init) throw new HttpError(400, 'not_a_pool_creation');
    const acct = (i: number) => keys[init.accountKeyIndexes[i]!]!;
    const creator = acct(0);
    const configId = acct(1);
    const poolKey = acct(3);
    // The creator paid for and signed the transaction.
    if (!keys[0]!.equals(creator) || !msg.isAccountSigner(0)) throw new HttpError(400, 'creator_not_signer');

    const fee = ctx.config?.feeLamports ?? 0n;
    if (ctx.config?.treasury && fee > 0n) {
      const ti = keys.findIndex((k) => k.toBase58() === ctx.config!.treasury);
      const paid = ti >= 0 ? BigInt(tx.meta.postBalances[ti]! - tx.meta.preBalances[ti]!) : 0n;
      if (paid < fee) throw new HttpError(400, 'fee_missing');
    }

    const [poolAcc, configAcc] = await withTimeout(rpc.getMultipleAccountsInfo([poolKey, configId]), RPC_MS);
    const state = poolAcc && poolAcc.owner.equals(programId) ? decodeCpmmPool(poolAcc.data) : null;
    if (!state) throw new HttpError(400, 'pool_not_found');
    const feeBps = configAcc && configAcc.owner.equals(programId) ? cpmmConfigFeeBps(configAcc.data) : null;
    if (feeBps === null) throw new HttpError(400, 'pool_not_found');

    const book = await market.quoteBook();
    const [qm, bm] = quoteRank(book.assets[state.mintA]) >= quoteRank(book.assets[state.mintB]) ? [state.mintA, state.mintB] : [state.mintB, state.mintA];
    const quote = book.assets[qm];
    if (!quote) throw new HttpError(400, 'not_an_oxbow_pair');

    const [vaultA, vaultB] = await withTimeout(rpc.getMultipleAccountsInfo([new PublicKey(state.vaultA), new PublicKey(state.vaultB)]), RPC_MS);
    if (!vaultA || !vaultB) throw new HttpError(400, 'pool_not_found');
    const amountA = unpackAccount(new PublicKey(state.vaultA), vaultA, vaultA.owner).amount;
    const amountB = unpackAccount(new PublicKey(state.vaultB), vaultB, vaultB.owner).amount;
    const baseIsA = bm === state.mintA;
    const reserveBase = uiAmount(baseIsA ? amountA : amountB, baseIsA ? state.decimalsA : state.decimalsB);
    const reserveQuote = uiAmount(baseIsA ? amountB : amountA, baseIsA ? state.decimalsB : state.decimalsA);
    if (!(reserveBase > 0) || !(reserveQuote > 0)) throw new HttpError(400, 'empty_pool');

    const looked = await withTimeout(lookupToken(rpc, bm, { fetchJson: ctx.fetchJson, ipfsGateway: ctx.ipfsGateway }), RPC_MS);
    if (looked.status !== 'found') throw new HttpError(400, 'not_a_mint', { mint: bm });
    const t = looked.token;

    const priceUsd = (reserveQuote / reserveBase) * quote.priceUsd;
    const tvlUsd = reserveQuote * quote.priceUsd * 2;
    const createdAt = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(ctx.now());
    const address = poolKey.toBase58();
    const lpAta = getAssociatedTokenAddressSync(new PublicKey(state.lpMint), creator).toBase58();
    const holders: HolderSlice[] = [{ kind: 'CREATOR', pct: 100, unlockAt: null, proof: { kind: 'account', id: lpAta } }];

    const tokenData = {
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      supply: t.supply,
      tokenProgram: t.tokenProgram,
      mintAuthority: t.mintAuthority,
      freezeAuthority: t.freezeAuthority,
      logoUri: t.logoUri,
      extensions: t.extensions as Prisma.InputJsonValue,
      risk: t.risk as unknown as Prisma.InputJsonValue,
    };
    await db.$transaction([
      db.token.upsert({ where: { mint: bm }, create: { mint: bm, ...tokenData }, update: tokenData }),
      db.pool.upsert({
        where: { address },
        create: {
          address,
          venue: 'RAYDIUM_CPMM',
          baseMint: bm,
          quoteMint: qm,
          quoteKind: quote.kind,
          feeBps: Math.round(feeBps),
          lpMint: state.lpMint,
          creator: creator.toBase58(),
          createdTx: signature,
          createdAt,
          holders: holders as unknown as Prisma.InputJsonValue,
          reserveBase,
          reserveQuote,
          priceUsd,
          tvlUsd,
        },
        update: {},
      }),
      db.poolSnapshot.create({ data: { poolAddress: address, ts: createdAt, priceUsd, tvlUsd, volUsd: 0 } }),
      db.liquidityEvent.upsert({
        where: { sig: signature },
        create: { sig: signature, poolAddress: address, ts: createdAt, kind: 'CREATE', wallet: creator.toBase58(), amountUsd: tvlUsd },
        update: {},
      }),
    ]);

    const item: ActivityItem = {
      id: signature,
      kind: 'POOL',
      pool: { address, base: assetRef(t), quote: { mint: quote.mint, symbol: quote.symbol, name: quote.name, logoUri: quote.logoUri, brand: quote.brand } },
      wallet: creator.toBase58(),
      amountUsd: tvlUsd,
      ts: createdAt.getTime(),
    };
    await Promise.all([ctx.hub.publish(item).catch(() => {}), dropListings(cache, address)]);
    return market.pool(address);
  });

  // ---------------------------------------------------------------- burn LP

  app.post('/api/pools/:address/burn', strict, async (req, reply): Promise<BuiltTx> => {
    const { address } = z.object({ address: AddressSchema }).parse(req.params);
    const { creator } = BurnBuildBodySchema.parse(req.body);
    priv(reply);
    const pool = await db.pool.findUnique({ where: { address }, select: { creator: true, lpMint: true } });
    if (!pool || !pool.lpMint) throw new HttpError(404, 'not_found');
    if (pool.creator !== creator) throw new HttpError(403, 'not_creator');
    const ata = getAssociatedTokenAddressSync(new PublicKey(pool.lpMint), new PublicKey(creator));
    const bal = await withTimeout(rpc.getTokenAccountBalance(ata), RPC_MS).catch(() => null);
    const amount = bal ? BigInt(bal.value.amount) : 0n;
    if (amount <= 0n) throw new HttpError(400, 'nothing_to_burn');
    const { blockhash } = await withTimeout(rpc.getLatestBlockhash('confirmed'), RPC_MS);
    return { transaction: b64(buildBurnLpTx({ creator, lpMint: pool.lpMint, amount, decimals: bal!.value.decimals, recentBlockhash: blockhash })), pool: address };
  });

  app.post('/api/pools/:address/lock', strict, async (req, reply) => {
    const { address } = z.object({ address: AddressSchema }).parse(req.params);
    const { signature } = LockPoolBodySchema.parse(req.body);
    priv(reply);
    const pool = await db.pool.findUnique({ where: { address }, select: { creator: true, lpMint: true } });
    if (!pool || !pool.lpMint) throw new HttpError(404, 'not_found');

    const tx = await withTimeout(rpc.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }), RPC_MS);
    if (!tx || !tx.meta) throw new HttpError(409, 'not_confirmed');
    if (tx.meta.err) throw new HttpError(400, 'tx_failed');
    const msg = tx.transaction.message;
    const keys = [...msg.staticAccountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
    // SPL Token Burn (8) or BurnChecked (15): [account, mint, authority].
    let burned = 0n;
    for (const c of msg.compiledInstructions) {
      if (!keys[c.programIdIndex]?.equals(TOKEN_PROGRAM_ID)) continue;
      const data = Buffer.from(c.data);
      if (data[0] !== 8 && data[0] !== 15) continue;
      const mint = keys[c.accountKeyIndexes[1]!]?.toBase58();
      const authority = keys[c.accountKeyIndexes[2]!]?.toBase58();
      if (mint === pool.lpMint && authority === pool.creator) burned += data.readBigUInt64LE(1);
    }
    if (burned <= 0n) throw new HttpError(400, 'no_lp_burn');

    const ata = getAssociatedTokenAddressSync(new PublicKey(pool.lpMint), new PublicKey(pool.creator));
    const left = await withTimeout(rpc.getTokenAccountBalance(ata), RPC_MS).then(
      (r) => BigInt(r.value.amount),
      () => 0n,
    );
    const pct = left === 0n ? 100 : Math.floor(Number((burned * 100n) / (burned + left)));
    const holders: HolderSlice[] = [
      { kind: 'BURNED', pct, unlockAt: null, proof: { kind: 'tx', id: signature } },
      ...(pct < 100 ? [{ kind: 'CREATOR' as const, pct: 100 - pct, unlockAt: null, proof: { kind: 'account' as const, id: ata.toBase58() } }] : []),
    ];
    await db.pool.update({
      where: { address },
      data: { lpStatus: pct >= 100 ? 'BURNED' : 'PARTIAL', lpLockedPct: pct, holders: holders as unknown as Prisma.InputJsonValue },
    });
    await dropListings(cache, address);
    return market.pool(address);
  });

  // ---------------------------------------------------------------- balances

  app.get('/api/wallet/:address/balances', async (req, reply) => {
    const { address } = z.object({ address: AddressSchema }).parse(req.params);
    const { mints } = z
      .object({
        mints: z
          .string()
          .max(10 * 45)
          .transform((v) => [...new Set(v.split(',').filter(Boolean))])
          .pipe(z.array(AddressSchema).min(1).max(10)),
      })
      .parse(req.query);
    priv(reply);
    const owner = new PublicKey(address);
    const out: Record<string, number> = {};
    await Promise.all(
      mints.map(async (mint) => {
        if (mint === SOL_MINT) {
          out[mint] = (await withTimeout(rpc.getBalance(owner), RPC_MS)) / 1e9;
          return;
        }
        const res = await withTimeout(rpc.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }), RPC_MS);
        out[mint] = res.value.reduce((s, a) => s + Number((a.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number } } }).info?.tokenAmount?.uiAmount ?? 0), 0);
      }),
    );
    return out;
  });
}

/** A new or changed pool shows up in listings at once instead of when caches expire. */
function dropListings(cache: Cache, address: string) {
  return cache.drop('pools:v1:*', `pool:v1:${address}`, 'stats:v1', 'ticker:v1', 'movers:v1', 'stocks:v1', 'activity:v1');
}
