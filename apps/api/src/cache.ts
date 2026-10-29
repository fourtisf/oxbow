import type { Redis } from 'ioredis';

/**
 * Read-through JSON cache in Redis. If Redis is down the value is computed
 * every time instead: slower, never wrong.
 */
export class Cache {
  constructor(private readonly redis: Redis | null) {}

  /** `ttlSec` can depend on the value (e.g. cache "not found" for less time). */
  async wrap<T>(key: string, ttlSec: number | ((v: T) => number), fn: () => Promise<T>): Promise<T> {
    if (this.redis) {
      try {
        const hit = await this.redis.get(key);
        if (hit !== null) return JSON.parse(hit) as T;
      } catch {
        // fall through to a fresh value
      }
    }
    const value = await fn();
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', typeof ttlSec === 'number' ? ttlSec : ttlSec(value));
      } catch {
        // caching is best effort
      }
    }
    return value;
  }
}
