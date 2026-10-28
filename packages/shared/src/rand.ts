/**
 * Deterministic hashing and PRNG from the prototype. Used for generated avatars,
 * decorative sparklines and the mock data layer, so the same input always
 * produces the same output on the server and in the browser.
 */

/** FNV-1a 32-bit. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** xorshift32, returns floats in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Random base58 string of length `n` (mock addresses only). */
export function b58(r: () => number, n: number): string {
  let o = '';
  for (let i = 0; i < n; i++) o += B58_ALPHABET[Math.floor(r() * 58)];
  return o;
}

/** Multiplicative random walk used by decorative sparklines. */
export function rwalk(seed: string, n: number, trend: number): number[] {
  const r = rng(hash(seed));
  let v = 1;
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    v *= 1 + (r() - 0.5 + trend) * 0.08;
    a.push(v);
  }
  return a;
}
