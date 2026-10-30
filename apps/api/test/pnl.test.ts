import { describe, expect, it } from 'vitest';
import { isOpen, openPart, positions, summarize, type PnlTrade } from '../src/tracker/pnl';

const t = (min: number, side: 'BUY' | 'SELL', mint: string, amount: number, usd: number): PnlTrade => ({ ts: new Date(1_793_000_000_000 + min * 60_000), side, mint, amount, usd });

describe('average-cost PnL', () => {
  it('realizes the difference between sale and average cost', () => {
    const p = positions([t(0, 'BUY', 'A', 100, 10), t(1, 'BUY', 'A', 100, 30), t(2, 'SELL', 'A', 100, 50)]).get('A')!;
    // Average cost 0.2/token: selling 100 for $50 realizes $30, leaving 100 tokens that cost $20.
    expect(p.realized).toBeCloseTo(30);
    expect(p.qty).toBeCloseTo(100);
    expect(p.cost).toBeCloseTo(20);
    expect(isOpen(p)).toBe(true);
  });

  it('counts only what was seen bought when more is sold', () => {
    const p = positions([t(0, 'BUY', 'A', 50, 10), t(1, 'SELL', 'A', 100, 40)]).get('A')!;
    // Half the sale matches tracked buys: $20 proceeds against $10 cost.
    expect(p.realized).toBeCloseTo(10);
    expect(p.qty).toBe(0);
    expect(isOpen(p)).toBe(false);
  });

  it('ignores sells with nothing bought while tracked', () => {
    const p = positions([t(0, 'SELL', 'A', 10, 99)]).get('A')!;
    expect(p.realized).toBe(0);
    expect(p.matched).toBe(false);
  });

  it('sums wins, losses, volume and unrealized PnL', () => {
    const pos = positions([
      t(0, 'BUY', 'WIN', 10, 100),
      t(1, 'SELL', 'WIN', 10, 180),
      t(2, 'BUY', 'LOSS', 10, 100),
      t(3, 'SELL', 'LOSS', 10, 40),
      t(4, 'BUY', 'HOLD', 1000, 50),
    ]);
    const s = summarize(pos.values(), (m) => (m === 'HOLD' ? 0.08 : null));
    expect(s).toMatchObject({ trades: 5, buys: 3, sells: 2, wins: 1, losses: 1, tokensTraded: 3 });
    expect(s.winRate).toBe(0.5);
    expect(s.volumeUsd).toBeCloseTo(470);
    expect(s.realizedPnlUsd).toBeCloseTo(20);
    expect(s.unrealizedPnlUsd).toBeCloseTo(30);
  });

  it('has no win rate before the first matched sell', () => {
    expect(summarize(positions([t(0, 'BUY', 'A', 1, 1)]).values(), () => null).winRate).toBeNull();
  });

  it('caps holdings at the on-chain balance', () => {
    const p = positions([t(0, 'BUY', 'A', 100, 40)]).get('A')!;
    expect(openPart(p, null)).toEqual({ qty: 100, cost: 40 });
    expect(openPart(p, 25)).toEqual({ qty: 25, cost: 10 });
    expect(openPart(p, 0)).toBeNull();
  });
});
