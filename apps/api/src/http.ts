import type { FastifyReply } from 'fastify';

/** An error the client gets as `{ error: code, ...extra }` with this status. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly extra?: Record<string, string | number>,
  ) {
    super(code);
  }
}

/** Public caching for market data; nginx and browsers may reuse it briefly. */
export const pub = (reply: FastifyReply, sec: number) => reply.header('cache-control', `public, max-age=${sec}`);
export const priv = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref())]);
}
