/**
 * Wallet addresses out of whatever text the owner pastes: a plain list, a CSV,
 * or a page copied from a leaderboard (GMGN, Kolscan, FOMO, pump.fun...).
 * Anything shaped like a Solana address that decodes to 32 bytes counts;
 * transaction signatures (longer) and shortened addresses ("5w4A…2Du9") don't.
 * A line holding one address and a short plain name keeps the name as its label.
 */
import { PublicKey } from '@solana/web3.js';

export interface ListedWallet {
  address: string;
  label?: string;
}

const ADDRESS = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
const LABEL = /^[\p{L}\p{N} ._\-]{1,32}$/u;

function isAddress(s: string): boolean {
  try {
    return new PublicKey(s).toBase58() === s;
  } catch {
    return false;
  }
}

export function extractWallets(text: string): ListedWallet[] {
  const out = new Map<string, ListedWallet>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const found = (line.match(ADDRESS) ?? []).filter(isAddress);
    for (const address of found) {
      if (out.has(address)) continue;
      const rest = found.length === 1 ? line.replace(address, '').replace(/^[\s,;|]+|[\s,;|]+$/g, '').trim() : '';
      out.set(address, rest && LABEL.test(rest) ? { address, label: rest } : { address });
    }
  }
  return [...out.values()];
}
