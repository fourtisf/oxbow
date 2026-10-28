'use client';

/**
 * Mock wallet actions with the prototype's timings. They update the browser's
 * mock database so new pools, positions and fees show up across the app.
 * Replaced by real transactions in M3 (create) and M4 (liquidity, claims).
 */
import { b58, hash, matchDeposit, rng } from '@oxbow/shared';
import { db } from '../api/mock/db';
import { newPoolAddress } from '../api/mock/api';
import { BAL, fakeMint, Q, type MockLp, type MockPool } from '../api/mock/seed';
import { CREATE_STEPS, type Chain } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeSig = () => b58(rng(hash('sig' + Date.now() + Math.random())), 88);

function quoteSymByMint(mint: string): string | undefined {
  return Object.keys(Q).find((k) => fakeMint(k) === mint);
}

function findPool(address: string): MockPool {
  const p = db().pools.find((x) => x.addr === address);
  if (!p) throw new Error('Pool not found');
  return p;
}

export const mockChain: Chain = {
  async balances(_wallet, mints) {
    const out: Record<string, number> = {};
    for (const m of mints) {
      const sym = quoteSymByMint(m);
      out[m] = sym ? BAL[sym] ?? 0 : db().held.get(m) ?? 0;
    }
    return out;
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
    const pool: MockPool = {
      id: 'n' + now,
      base: { sym: p.token.symbol, name: p.token.name, mint: p.token.mint, supply: p.token.supply },
      quote: q.sym,
      venue: p.venue,
      feeBps: p.feeBps,
      tvl: p.quoteAmount * q.price * 2,
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
    };
    const d = db();
    d.dirty = true;
    d.pools.unshift(pool);
    d.positions.unshift({
      id: 'pos' + now,
      poolId: pool.id,
      share: 1,
      earned: 0,
      locked: lp.t !== 'unlocked',
      isCreator: true,
    });
    return { address: pool.addr };
  },

  // The prototype's swap only shows a toast; reserves don't move.
  async swap(_wallet, pool) {
    findPool(pool);
    return { signature: fakeSig() };
  },

  async addLiquidity(_wallet, address, baseIn) {
    const p = findPool(address);
    const { quoteIn, sharePct } = matchDeposit({ base: p.x, quote: p.y }, baseIn);
    const d = db();
    d.dirty = true;
    const ex = d.positions.find((x) => x.poolId === p.id && !x.locked);
    if (ex) ex.share += sharePct / 100;
    else d.positions.unshift({ id: 'pos' + Date.now(), poolId: p.id, share: sharePct / 100, earned: 0, locked: false, isCreator: false });
    p.tvl += quoteIn * Q[p.quote]!.price * 2;
    p.x += baseIn;
    p.y += quoteIn;
    return { signature: fakeSig() };
  },

  async claimFees(_wallet, positionId) {
    const x = db().positions.find((y) => y.id === positionId);
    if (!x) throw new Error('Position not found');
    const amountUsd = x.earned;
    x.earned = 0;
    return { amountUsd };
  },

  async withdraw(_wallet, positionId) {
    const d = db();
    d.positions = d.positions.filter((y) => y.id !== positionId);
    return { signature: fakeSig() };
  },
};

/** Positions the prototype gives a freshly connected wallet. */
export function seedMockPositions() {
  const d = db();
  if (d.positions.length) return;
  const at = (id: string) => d.pools.find((p) => p.id === id);
  const seed: [string, number, number][] = [
    ['p0', 0.042, 38.4],
    ['p5', 0.118, 112.9],
    ['p9', 0.021, 6.2],
  ];
  for (const [poolId, share, earned] of seed) {
    if (at(poolId)) d.positions.push({ id: 'pos-' + poolId, poolId, share, earned, locked: false, isCreator: false });
  }
}

export const chain: Chain = mockChain;
