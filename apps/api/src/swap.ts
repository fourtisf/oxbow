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
 */
import type { FastifyInstance } from 'fastify';
import { PublicKey, type AddressLookupTableAccount, type Connection } from '@solana/web3.js';
import { SOL_MINT, SwapBuildBodySchema, SwapQuoteQuerySchema, type BuiltSwap, type SwapQuote, type SwapQuoteQuery } from '@oxbow/shared';
import { composeSwapTx, feeOf, SwapAssemblyError } from '@oxbow/solana/swap';
import { HttpError, priv, withTimeout } from './http';
import { JupiterError, type Jupiter, type JupiterQuote } from './jupiter';

export type SwapRpc = Pick<Connection, 'getLatestBlockhash' | 'getAddressLookupTable' | 'getBalance' | 'getMinimumBalanceForRentExemption'>;

export interface SwapConfig {
  treasury?: string;
  /** Oxbow's fee in basis points of the SOL side (50 = 0.5%). */
  feeBps: number;
}

interface Ctx {
  jup: Jupiter;
  rpc: SwapRpc;
  config: SwapConfig;
  now: () => number;
  log: (msg: string) => void;
}

const RPC_MS = 8000;

/** Jupiter's refusals as API errors: busy (rate-limited) is not "no route". */
export function jupiterFailure(e: unknown): never {
  if (e instanceof JupiterError && e.status === 429) throw new HttpError(503, 'jupiter_busy');
  if (e instanceof JupiterError && e.status >= 400 && e.status < 500) throw new HttpError(400, 'no_route', { detail: e.detail.slice(0, 120) });
  throw new HttpError(502, 'jupiter_unavailable');
}
const TREASURY_CHECK_MS = 10 * 60_000;
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

  async function quote(q: SwapQuoteQuery): Promise<{ quote: SwapQuote; raw: JupiterQuote; fee: bigint }> {
    const buy = q.inputMint === SOL_MINT;
    if (buy === (q.outputMint === SOL_MINT)) throw new HttpError(400, 'sol_side_required');
    const bps = await feeBps();
    const amount = BigInt(q.amount);
    const buyFee = buy ? feeOf(amount, bps) : 0n;
    let raw: JupiterQuote;
    try {
      raw = await jup.quote({ inputMint: q.inputMint, outputMint: q.outputMint, amount: amount - buyFee, slippageBps: q.slippageBps });
    } catch (e) {
      jupiterFailure(e);
    }
    const fee = buy ? buyFee : feeOf(BigInt(raw.outAmount), bps);
    const threshold = BigInt(raw.otherAmountThreshold);
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
        slippageBps: raw.slippageBps,
        feeLamports: fee.toString(),
        feeBps: bps,
        route: [...new Set(raw.routePlan.map((r) => r.swapInfo.label).filter((l): l is string => !!l))].slice(0, 4),
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
    const q = await quote(body);
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
      return { transaction: Buffer.from(tx.serialize()).toString('base64'), quote: q.quote, lastValidBlockHeight };
    } catch (e) {
      if (e instanceof SwapAssemblyError) {
        ctx.log(`Swap refused: ${e.code}`);
        throw new HttpError(502, e.code);
      }
      throw e;
    }
  });

  return { feeBps };
}
