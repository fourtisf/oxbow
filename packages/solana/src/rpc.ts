/**
 * RPC connection and the native SOL mint, from @solana/web3.js and
 * @solana/spl-token (never typed in by hand).
 */
import { clusterApiUrl, Connection } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';

export type Cluster = 'devnet' | 'mainnet-beta';

/** A connection to `url`, or Solana's public endpoint for the cluster (rate-limited; set your own for production). */
export function connect(url: string | undefined, cluster: Cluster): Connection {
  return new Connection(url || clusterApiUrl(cluster), 'confirmed');
}

/** Wrapped SOL, the mint pools use for SOL. */
export const SOL_MINT = NATIVE_MINT.toBase58();
