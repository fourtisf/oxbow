'use client';

/**
 * Mock wallet actions with the prototype's timings. They update the browser's
 * mock database so new pools, positions, fees and history show up across the
 * app. Replaced by real transactions in M3 (create) and M4 (liquidity, claims).
 */
import { feeRateFromBps, hash, matchDeposit, quoteBuy, quoteSell, rng } from '@oxbow/shared';
import { db, fakeSig, logActivity } from '../api/mock/db';
import { newPoolAddress } from '../api/mock/api';
import { BAL, fakeMint, Q, series, type MockLp, type MockPool } from '../api/mock/seed';
import { ChainError, CREATE_STEPS, type Chain } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function quoteSymByMint(mint: string): string | undefined {
  return Object.keys(Q).find((k) => fakeMint(k) === mint);
}

function findPool(address: string): MockPool {
  const p = db().pools.find((x) => x.addr === address);
  if (!p) throw new ChainError('NOT_FOUND');
  return p;
}

const quotePrice = (p: MockPool) => Q[p.quote]!.price;

/** Mock holdings: what the wallet has traded to, else the prototype's balances for pair assets and a small bag of each listed token. */
function balanceOf(mint: string): number {
  const d = db();
  const held = d.held.get(mint);
  if (held !== undefined) return held;
  const sym = quoteSymByMint(mint);
  if (sym) return BAL[sym] ?? 0;
  const pool = d.pools.find((p) => p.base.mint === mint);
  return pool ? Math.round(pool.x * 0.002) : 0;
}

const adjust = (mint: string, delta: number) => db().held.set(mint, Math.max(0, balanceOf(mint) + delta));

/** Moves the pool's reserves and keeps its USD price and liquidity in line with them. */
function setReserves(p: MockPool, x: number, y: number) {
  p.x = x;
  p.y = y;
  if (x > 0 && y > 0) p.priceUSD = (y / x) * quotePrice(p);
  p.tvl = y * quotePrice(p) * 2;
}

export const mockChain: Chain = {
  async balances(_wallet, mints) {
    return Object.fromEntries(mints.map((m) => [m, balanceOf(m)]));
  },

  async createPool(wallet, p, onStep) {
    // Prototype timing: 1.1s on "approve", then 0.8s per step.
    for (let i = 0; i < CREATE_STEPS.length; i++) {
      onStep(i);
      await wait(i === 0 ? 1100 : 800);
    }
    onStep(CREATE_STEPS.length);

    const q = Q[p.quote.symbol]!;
    const lp: MockLp =
      p.lock.kind === 'burn'
        ? { t: 'burned', pct: 100 }
        : p.lock.kind === 'none'
          ? { t: 'unlocked', pct: 0 }
          : p.lock.pct >= 100
            ? { t: 'locked', pct: 100, days: p.lock.days }
            : { t: 'partial', pct: p.lock.pct, days: p.lock.days };
    const now = Date.now();
    const d = db();
    const tvl = p.quoteAmount * q.price * 2;
    const pool: MockPool = {
      id: 'n' + now,
      base: { sym: p.token.symbol, name: p.token.name, mint: p.token.mint, supply: p.token.supply, logo: p.token.logoUri },
      quote: q.sym,
      venue: p.venue,
      feeBps: p.feeBps,
      tvl,
      vol: 0,
      ageH: 0,
      createdAtMs: now,
      lp,
      unlockAtMs: p.lock.kind === 'lock' ? now + p.lock.days * 864e5 : null,
      chg: 0,
      priceUSD: (p.quoteAmount / p.baseAmount) * q.price,
      x: p.baseAmount,
      y: p.quoteAmount,
      addr: newPoolAddress(p.token.mint + now),
      buys: 50,
      creator: wallet,
      token: {
        ageDays: p.token.createdAt ? (now - Date.parse(p.token.createdAt)) / 864e5 : null,
        holders: 1,
        top10Pct: 100,
        mintAuthority: p.token.mintAuthority,
        freezeAuthority: p.token.freezeAuthority,
        transferFee: p.token.risk.transferFee,
        transferHook: p.token.risk.transferHook,
        permanentDelegate: p.token.risk.permanentDelegate,
        creatorPools: 1 + d.pools.filter((x) => x.creator === wallet).length,
        creatorPulled: 0,
      },
    };
    d.dirty = true;
    adjust(p.token.mint, -p.baseAmount);
    adjust(fakeMint(q.sym), -p.quoteAmount);
    d.pools.unshift(pool);
    d.positions.unshift({
      id: 'pos' + now,
      poolId: pool.id,
      share: 1,
      earned: 0,
      locked: lp.t !== 'unlocked',
      isCreator: true,
      depositedUsd: tvl,
      entryPriceQuote: p.quoteAmount / p.baseAmount,
    });
    logActivity('CREATE', pool.id, tvl, now);
    return { address: pool.addr };
  },

  // Reserves don't move on a mock swap, as in the prototype; it is recorded in the wallet's history.
  async swap(_wallet, address, s) {
    const p = findPool(address);
    const r = { base: p.x, quote: p.y };
    const fee = feeRateFromBps(p.feeBps);
    const q = s.side === 'BUY' ? quoteBuy(r, s.amountIn, fee) : quoteSell(r, s.amountIn, fee);
    if (q.out < s.minOut) throw new ChainError('SLIPPAGE');
    db().dirty = true;
    const quoteMint = fakeMint(p.quote);
    const usd = (s.side === 'BUY' ? s.amountIn : q.out) * quotePrice(p);
    if (s.side === 'BUY') {
      adjust(quoteMint, -s.amountIn);
      adjust(p.base.mint, q.out);
      setReserves(p, p.x - q.out, p.y + s.amountIn);
    } else {
      adjust(p.base.mint, -s.amountIn);
      adjust(quoteMint, q.out);
      setReserves(p, p.x + s.amountIn, p.y - q.out);
    }
    p.vol += usd;
    logActivity('SWAP', p.id, usd);
    return { signature: fakeSig('swap' + Date.now()), out: q.out };
  },

  async addLiquidity(_wallet, address, baseIn) {
    const p = findPool(address);
    const { quoteIn, sharePct } = matchDeposit({ base: p.x, quote: p.y }, baseIn);
    const d = db();
    d.dirty = true;
    const usdIn = quoteIn * quotePrice(p) * 2;
    const price = p.y / p.x;
    // Existing positions in this pool now own a smaller slice of a bigger pool.
    for (const o of d.positions) if (o.poolId === p.id) o.share *= 1 - sharePct / 100;
    const ex = d.positions.find((x) => x.poolId === p.id && !x.locked);
    if (ex) {
      ex.entryPriceQuote = (ex.entryPriceQuote * ex.depositedUsd + price * usdIn) / (ex.depositedUsd + usdIn);
      ex.share += sharePct / 100;
      ex.depositedUsd += usdIn;
    } else {
      d.positions.unshift({ id: 'pos' + Date.now(), poolId: p.id, share: sharePct / 100, earned: 0, locked: false, isCreator: false, depositedUsd: usdIn, entryPriceQuote: price });
    }
    adjust(p.base.mint, -baseIn);
    adjust(fakeMint(p.quote), -quoteIn);
    setReserves(p, p.x + baseIn, p.y + quoteIn);
    logActivity('ADD', p.id, usdIn);
    return { signature: fakeSig('add' + Date.now()) };
  },

  async claimFees(_wallet, positionId) {
    const x = db().positions.find((y) => y.id === positionId);
    if (!x) throw new ChainError('NOT_FOUND');
    const amountUsd = x.earned;
    x.earned = 0;
    logActivity('CLAIM', x.poolId, amountUsd);
    return { amountUsd };
  },

  async withdraw(_wallet, positionId, pct) {
    const d = db();
    const x = d.positions.find((y) => y.id === positionId);
    if (!x) throw new ChainError('NOT_FOUND');
    const p = d.pools.find((y) => y.id === x.poolId);
    const k = Math.min(100, Math.max(1, pct)) / 100;
    const out = x.share * k;
    if (p) {
      logActivity('REMOVE', p.id, p.tvl * out);
      adjust(p.base.mint, p.x * out);
      adjust(fakeMint(p.quote), p.y * out);
      setReserves(p, p.x * (1 - out), p.y * (1 - out));
    }
    if (k >= 1) d.positions = d.positions.filter((y) => y !== x);
    else {
      x.share -= out;
      x.depositedUsd *= 1 - k;
    }
    // Everyone left in the pool now owns a bigger slice of a smaller pool.
    for (const o of d.positions) if (o.poolId === x.poolId && out < 1) o.share /= 1 - out;
    return { signature: fakeSig('rm' + Date.now()) };
  },
};

/** Positions the prototype gives a freshly connected wallet, with deposit history a week back. */
export function seedMockPositions() {
  const d = db();
  if (d.positions.length) return;
  const seed: [string, number, number][] = [
    ['p0', 0.042, 38.4],
    ['p5', 0.118, 112.9],
    ['p9', 0.021, 6.2],
  ];
  const now = Date.now();
  for (const [poolId, share, earned] of seed) {
    const p = d.pools.find((x) => x.id === poolId);
    if (!p) continue;
    const q = Q[p.quote]!;
    // Entered at the start of the 7-day chart. LP value scales with √price, so back out the deposit from that.
    const entryUsd = series(p, '1W')[0]!;
    const entryPriceQuote = entryUsd / q.price;
    const ratio = p.priceUSD / q.price / entryPriceQuote;
    const depositedUsd = (p.tvl * share) / Math.sqrt(ratio);
    d.positions.push({ id: 'pos-' + poolId, poolId, share, earned, locked: false, isCreator: false, depositedUsd, entryPriceQuote });
    const r = rng(hash('hist-' + poolId));
    logActivity('ADD', poolId, depositedUsd, now - (5 + r() * 2) * 864e5);
  }
  d.activity.sort((a, b) => b.ts - a.ts);
}

