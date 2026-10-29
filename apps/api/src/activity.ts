import type { Redis } from 'ioredis';
import { ActivityItemSchema, type ActivityItem } from '@oxbow/shared';

/** Redis channel the indexer and pool registration publish new activity on. */
export const ACTIVITY_CHANNEL = 'oxbow:activity';

type Listener = (item: ActivityItem) => void;

/**
 * One Redis subscription per process, fanned out to every open SSE stream.
 * Messages are parsed against the shared schema; anything else is dropped.
 */
export class ActivityHub {
  private readonly listeners = new Set<Listener>();
  private sub: Redis | null = null;

  constructor(private readonly redis: Redis | null) {}

  get size() {
    return this.listeners.size;
  }

  async publish(item: ActivityItem): Promise<void> {
    await this.redis?.publish(ACTIVITY_CHANNEL, JSON.stringify(item));
  }

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    if (!this.sub && this.redis) {
      const sub = this.redis.duplicate();
      this.sub = sub;
      sub.on('message', (_channel, raw: string) => {
        let item: ActivityItem;
        try {
          const parsed = ActivityItemSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) return;
          item = parsed.data;
        } catch {
          return;
        }
        for (const l of this.listeners) l(item);
      });
      sub.on('error', () => {
        // ioredis reconnects on its own; streams simply see no events meanwhile.
      });
      sub.subscribe(ACTIVITY_CHANNEL).catch(() => {});
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
