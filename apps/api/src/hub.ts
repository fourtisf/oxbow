import type { Redis } from 'ioredis';
import { FeedTradeSchema, type FeedTrade } from '@oxbow/shared';

/** Redis channel the tracker worker publishes live trades on. */
export const TRADES_CHANNEL = 'oxbow:trades';
/** Redis channel the API tells the worker about newly tracked wallets on. */
export const WALLETS_CHANNEL = 'oxbow:wallets';

/** The worker's last sign of life (epoch ms), and whether its websocket is connected ("1"). */
export const TRACKER_HEARTBEAT_KEY = 'oxbow:tracker:heartbeat';
export const TRACKER_LIVE_KEY = 'oxbow:tracker:live';

type Listener = (trade: FeedTrade) => void;

/**
 * One Redis subscription per process, fanned out to every open SSE stream.
 * Messages are parsed against the shared schema; anything else is dropped.
 */
export class TradeHub {
  private readonly listeners = new Set<Listener>();
  private sub: Redis | null = null;

  constructor(private readonly redis: Redis | null) {}

  get size() {
    return this.listeners.size;
  }

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    if (!this.sub && this.redis) {
      const sub = this.redis.duplicate();
      this.sub = sub;
      sub.on('message', (_channel, raw: string) => {
        let trade: FeedTrade;
        try {
          const parsed = FeedTradeSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) return;
          trade = parsed.data;
        } catch {
          return;
        }
        for (const l of this.listeners) l(trade);
      });
      sub.on('error', () => {
        // ioredis reconnects on its own; streams simply see no events meanwhile.
      });
      sub.subscribe(TRADES_CHANNEL).catch(() => {});
    }
    return () => {
      this.listeners.delete(fn);
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    const sub = this.sub;
    this.sub = null;
    if (sub) await sub.quit().catch(() => sub.disconnect());
  }
}

/** Publishes live trades for every API process's streams. */
export function tradePublisher(redis: Redis | null) {
  return async (trades: FeedTrade[]) => {
    if (!redis) return;
    for (const t of trades) await redis.publish(TRADES_CHANNEL, JSON.stringify(t)).catch(() => 0);
  };
}
