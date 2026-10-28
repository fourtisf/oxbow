/** Base58, 32–44 chars, no 0 O I l. Shape check only; on-chain existence is checked separately. */
export const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isAddress(v: string): boolean {
  return BASE58_ADDRESS_RE.test(v);
}
