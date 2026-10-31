/**
 * Copy trading: buy or sell a token for SOL through Jupiter's routing. The
 * server asks Jupiter for the route, assembles the transaction with Oxbow's
 * fee as a SOL transfer to the treasury, and hands it to the trader's wallet
 * unsigned. Nothing is signed or held here.
 *
 * Fee: `feeBps` of the SOL side. On a buy it comes out of the SOL the trader
 * puts in (so they spend exactly what they chose); on a sell it is taken from
 * the SOL the route is expected to return. Off when no treasury is set or the
 * treasury account can't receive SOL yet (it needs its rent-exempt minimum).
 *
 * Before the transaction goes to the wallet it is simulated against the
 * trader's real balances, so a trade that would fail (not enough SOL, price
 * already past the slippage) is refused with the reason instead of reaching a
 * wallet prompt that can only fail. A price that moved while the trade was
 * being built gets one fresh quote before the trader hears about it.
 *
 * Slippage "Auto" (the default) is picked per trade: launchpad markets
 * (pump.fun and the like) and thin or unvetted tokens move more in the seconds
 * a signature takes than deep, verified ones do.
 */
import type { FastifyInstance } from 'fastify';
import { PublicKey, type AddressLookupTableAccount, type Connection, type VersionedTransaction } from '@solana/web3.js';
import { SLIPPAGE_AUTO, SOL_MINT, SwapBuildBodySchema, SwapQuoteQuerySchema, txFailure, type BuiltSwap, type SwapBuildBody, type SwapQuote, type SwapQuoteQuery } from '@oxbow/shared';
import { composeSwapTx, feeOf, SwapAssemblyError } from '@oxbow/solana/swap';
import { HttpError, priv, withTimeout } from './http';
import { JupiterError, type Jupiter, type JupiterQuote } from './jupiter';

export type SwapRpc = Pick<Connection, 'getLatestBlockhash' | 'getAddressLookupTable' | 'getBalance' | 'getMinimumBalanceForRentExemption' | 'simulateTransaction'>;

export interface SwapConfig {
  treasury?: string;
  /** Oxbow's fee in basis points of the SOL side (50 = 0.5%). */
  feeBps: number;
}

/** What Auto slippage needs to know about the token being traded. */
export interface TokenFacts {
  liquidity: number | null;
  verified: boolean;
  organicScore: number | null;
}

interface Ctx {
  jup: Jupiter;
  rpc: SwapRpc;
  config: SwapConfig;
  now: () => number;
  log: (msg: string) => void;
  /** Token facts for Auto slippage; without them Auto treats every token as thin. */
  facts?: (mint: string) => Promise<TokenFacts | null>;
}

/** Launchpad and bonding-curve markets, by Jupiter's route labels ("Pump.fun", "Pump.fun Amm", "Raydium Launchlab", "Meteora DBC"...). */
const LAUNCHPAD = /pump\.?fun|launch|moonshot|bonding|\bdbc\b|boop|believe/i;
/** Auto slippage, before the floor from the trade's own price impact. */
const AUTO = { launchpad: 500, thin: 300, mid: 100, deep: 50, max: 1000 } as const;
/** Quoted with this first when Auto is asked for (what most memecoins get). */
const AUTO_FIRST = AUTO.thin;

/**
 * Slippage for a trade on "Auto", in basis points: room for how much this market moves while the
 * trader signs. Never below the trade's own price impact (thin pools move more), never above 10%.
 */
export function autoSlippageBps(route: readonly string[], priceImpactPct: number, facts: TokenFacts | null): number {
  let bps: number;
  if (route.some((r) => LAUNCHPAD.test(r))) bps = AUTO.launchpad;
  else if (!facts || (facts.liquidity ?? 0) < 100_000 || (!facts.verified && (facts.organicScore ?? 0) < 50)) bps = AUTO.thin;
  else if ((facts.liquidity ?? 0) < 2_000_000) bps = AUTO.mid;
  else bps = AUTO.deep;
  return Math.min(AUTO.max, Math.max(bps, Math.ceil(priceImpactPct * 100)));
}

const routeOf = (raw: JupiterQuote) => [...new Set(raw.routePlan.map((r) => r.swapInfo.label).filter((l): l is string => !!l))].slice(0, 4);

const RPC_MS = 8000;

/** Jupiter's refusals as API errors: busy (rate-limited) is not "no route". */
export function jupiterFailure(e: unknown): never {
  if (e instanceof JupiterError && e.status === 429) throw new HttpError(503, 'jupiter_busy');
  if (e instanceof JupiterError && e.status >= 400 && e.status < 500) throw new HttpError(400, 'no_route', { detail: e.detail.slice(0, 120) });
  throw new HttpError(502, 'jupiter_unavailable');
}
const TREASURY_CHECK_MS = 10 * 60_000;
const SIMULATE_MS = 6000;

/**
 * Runs `tx` against the chain as it is now (no signature needed). Throws the reason when it would
 * fail; a node that can't answer in time lets the wallet decide.
 */
export async function preflight(rpc: Pick<Connection, 'simulateTransaction'>, tx: VersionedTransaction, log: (m: string) => void): Promise<void> {
  let sim;
  try {
    sim = await withTimeout(rpc.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }), SIMULATE_MS);
  } catch {
    return;
  }
  if (!sim.value.err) return;
  const logs = sim.value.logs ?? [];
  const text = `${JSON.stringify(sim.value.err)} ${logs.join(' ')}`;
  const kind = txFailure(text);
  const detail = (logs.find((l) => /Error Message|failed|insufficient|error/i.test(l)) ?? JSON.stringify(sim.value.err)).slice(0, 160);
  log(`Swap would fail (${kind}): ${detail}`);
  throw new HttpError(400, kind === 'failed' ? 'simulation_failed' : kind, { detail });
}
const ALT_MS = 60_000;

export function registerSwapRoutes(app: FastifyInstance, ctx: Ctx) {
  const { jup, rpc, config } = ctx;
  let treasuryOk: { ok: boolean; at: number } | null = null;
  const alts = new Map<string, { table: AddressLookupTableAccount; at: number }>();

  /** Fee settings for this swap: the treasury must exist and hold its rent minimum, or a transfer to it would fail. */
  async function feeBps(): Promise<number> {
    if (!config.treasury || config.feeBps <= 0) return 0;
    if (!treasuryOk || ctx.now() - treasuryOk.at > TREASURY_CHECK_MS) {
      try {
        const [bal, min] = await Promise.all([
          withTimeout(rpc.getBalance(new PublicKey(config.treasury)), RPC_MS),
          withTimeout(rpc.getMinimumBalanceForRentExemption(0), RPC_MS),
        ]);
        treasuryOk = { ok: bal >= min, at: ctx.now() };
        if (!treasuryOk.ok) ctx.log(`Swap fee off: the treasury holds ${bal} lamports, under the ${min} it needs to receive SOL`);
      } catch {
        // Can't tell: keep the last answer, or try again next time.
        return treasuryOk?.ok ? config.feeBps : 0;
      }
    }
    return treasuryOk.ok ? config.feeBps : 0;
  }

  /** `forBuild`: the route must carry the slippage itself (Auto re-quotes when it picked a different one). */
  async function quote(q: SwapQuoteQuery, forBuild = false): Promise<{ quote: SwapQuote; raw: JupiterQuote; fee: bigint }> {
    const buy = q.inputMint === SOL_MINT;
    if (buy === (q.outputMint === SOL_MINT)) throw new HttpError(400, 'sol_side_required');
    const bps = await feeBps();
    const amount = BigInt(q.amount);
    const buyFee = buy ? feeOf(amount, bps) : 0n;
    const auto = q.slippageBps === SLIPPAGE_AUTO;
    const ask = (slippageBps: number) => jup.quote({ inputMint: q.inputMint, outputMint: q.outputMint, amount: amount - buyFee, slippageBps });
    let raw: JupiterQuote;
    let slippage = auto ? AUTO_FIRST : q.slippageBps;
    try {
      raw = await ask(slippage);
      if (auto) {
        const facts = await ctx.facts?.(buy ? q.outputMint : q.inputMint).catch(() => null);
        const picked = autoSlippageBps(routeOf(raw), Number(raw.priceImpactPct) * 100 || 0, facts ?? null);
        if (picked !== slippage && forBuild) raw = await ask(picked);
        slippage = picked;
      }
    } catch (e) {
      jupiterFailure(e);
    }
    const fee = buy ? buyFee : feeOf(BigInt(raw.outAmount), bps);
    // The route's own floor, or (a quote shown with what Auto picked) the same floor worked out here.
    const threshold = raw.slippageBps === slippage ? BigInt(raw.otherAmountThreshold) : (BigInt(raw.outAmount) * BigInt(10_000 - slippage)) / 10_000n;
    // On a sell the fee is a fixed number of lamports, paid even at the worst fill.
    const minOut = buy ? threshold : threshold > fee ? threshold - fee : 0n;
    return {
      raw,
      fee,
      quote: {
        inputMint: q.inputMint,
        outputMint: q.outputMint,
        inAmount: raw.inAmount,
        outAmount: buy ? raw.outAmount : (BigInt(raw.outAmount) - fee).toString(),
        minOutAmount: minOut.toString(),
        priceImpactPct: Number(raw.priceImpactPct) * 100 || 0,
        slippageBps: slippage,
        autoSlippage: auto,
        feeLamports: fee.toString(),
        feeBps: bps,
        route: routeOf(raw),
      },
    };
  }

  async function lookupTables(addresses: string[]): Promise<AddressLookupTableAccount[]> {
    return Promise.all(
      addresses.map(async (a) => {
        const hit = alts.get(a);
        if (hit && ctx.now() - hit.at < ALT_MS) return hit.table;
        const res = await withTimeout(rpc.getAddressLookupTable(new PublicKey(a)), RPC_MS);
        if (!res.value) throw new HttpError(502, 'lookup_table_missing');
        alts.set(a, { table: res.value, at: ctx.now() });
        if (alts.size > 500) alts.delete(alts.keys().next().value!);
        return res.value;
      }),
    );
  }

  // Quotes refresh as the trader types and every few seconds while the panel is open.
  app.get('/api/swap/quote', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async (req, reply): Promise<SwapQuote> => {
    const q = SwapQuoteQuerySchema.parse(req.query);
    priv(reply);
    return (await quote(q)).quote;
  });

  app.post('/api/swap/build', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply): Promise<BuiltSwap> => {
    const body = SwapBuildBodySchema.parse(req.body);
    priv(reply);
    try {
      return await build(body);
    } catch (e) {
      // The price moved while it was being put together: one fresh quote before saying so.
      if (!(e instanceof HttpError && e.code === 'slippage')) throw e;
      ctx.log('Swap: price moved during the build; quoting again');
      return build(body);
    }
  });

  async function build(body: SwapBuildBody): Promise<BuiltSwap> {
    const q = await quote(body, true);
    let ixs;
    try {
      ixs = await jup.swapInstructions(q.raw, body.wallet);
    } catch (e) {
      jupiterFailure(e);
    }
    const [tables, { blockhash, lastValidBlockHeight }] = await Promise.all([
      lookupTables(ixs.addressLookupTableAddresses),
      withTimeout(rpc.getLatestBlockhash('confirmed'), RPC_MS),
    ]);
    try {
      const tx = composeSwapTx({
        payer: new PublicKey(body.wallet),
        ixs,
        lookupTables: tables,
        blockhash,
        fee: q.fee > 0n && config.treasury ? { to: new PublicKey(config.treasury), lamports: q.fee } : null,
      });
      await preflight(rpc, tx, ctx.log);
      return { transaction: Buffer.from(tx.serialize()).toString('base64'), quote: q.quote, lastValidBlockHeight };
    } catch (e) {
      if (e instanceof SwapAssemblyError) {
        ctx.log(`Swap refused: ${e.code}`);
        throw new HttpError(502, e.code);
      }
      throw e;
    }
  }

  return { feeBps };
}
