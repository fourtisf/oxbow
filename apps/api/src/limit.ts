/**
 * Limit orders through Jupiter's trigger service: the order sits on chain in
 * Jupiter's limit-order program and fills when the price reaches it. Oxbow
 * passes the trader's order to Jupiter, checks the transaction that comes
 * back (the trader pays and signs alone, only known programs), and hands it
 * to the wallet unsigned. One side is always SOL. No Oxbow fee on these.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AddressSchema, LimitCancelBodySchema, LimitCreateBodySchema, SOL_MINT, type BuiltLimit, type LimitOrder } from '@oxbow/shared';
import { checkTriggerTx, SwapAssemblyError } from '@oxbow/solana/swap';
import { HttpError, priv } from './http';
import { JupiterError, type Jupiter } from './jupiter';

function asHttp(e: unknown): never {
  if (e instanceof SwapAssemblyError) throw new HttpError(502, e.code);
  if (e instanceof JupiterError && e.status === 429) throw new HttpError(503, 'jupiter_busy');
  // Jupiter explains refusals (e.g. "Order size must be at least 5 USD"): pass that on.
  if (e instanceof JupiterError && e.status >= 400 && e.status < 500) throw new HttpError(400, 'limit_rejected', { detail: e.detail.slice(0, 160) });
  throw new HttpError(502, 'jupiter_unavailable');
}

export function registerLimitRoutes(app: FastifyInstance, jup: Jupiter) {
  const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.post('/api/limit/create', strict, async (req, reply): Promise<BuiltLimit> => {
    const b = LimitCreateBodySchema.parse(req.body);
    priv(reply);
    if ((b.inputMint === SOL_MINT) === (b.outputMint === SOL_MINT)) throw new HttpError(400, 'sol_side_required');
    if (b.expiredAt && b.expiredAt * 1000 < Date.now() + 60_000) throw new HttpError(400, 'bad_expiry');
    try {
      const r = await jup.createTrigger({ inputMint: b.inputMint, outputMint: b.outputMint, maker: b.wallet, makingAmount: b.makingAmount, takingAmount: b.takingAmount, expiredAt: b.expiredAt });
      checkTriggerTx(r.transaction, b.wallet);
      return { transaction: r.transaction, ...(r.order ? { order: r.order } : {}) };
    } catch (e) {
      asHttp(e);
    }
  });

  app.post('/api/limit/cancel', strict, async (req, reply): Promise<BuiltLimit> => {
    const b = LimitCancelBodySchema.parse(req.body);
    priv(reply);
    try {
      const r = await jup.cancelTrigger(b.wallet, b.order);
      checkTriggerTx(r.transaction, b.wallet);
      return { transaction: r.transaction };
    } catch (e) {
      asHttp(e);
    }
  });

  app.get('/api/limit/orders', async (req, reply): Promise<LimitOrder[]> => {
    const { wallet } = z.object({ wallet: AddressSchema }).parse(req.query);
    priv(reply);
    try {
      return await jup.triggerOrders(wallet);
    } catch (e) {
      asHttp(e);
    }
  });
}
