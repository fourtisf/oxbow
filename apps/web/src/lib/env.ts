import { z } from 'zod';
import { BASE58_ADDRESS_RE, LAMPORTS_PER_SOL } from '@oxbow/shared';

/**
 * Public (browser-safe) config. Next.js inlines NEXT_PUBLIC_* at build time,
 * so each one has to be referenced by its full name here.
 */
const schema = z.object({
  cluster: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
  rpcUrl: z.string().url().optional(),
  feeLamports: z.coerce.number().int().nonnegative().default(100_000_000),
  /** Shown in the hero CA box. The box is hidden when this is empty. */
  contractAddress: z.string().regex(BASE58_ADDRESS_RE).optional(),
});

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const env = schema.parse({
  cluster: blank(process.env.NEXT_PUBLIC_SOLANA_CLUSTER),
  rpcUrl: blank(process.env.NEXT_PUBLIC_RPC_URL),
  feeLamports: blank(process.env.NEXT_PUBLIC_OXBOW_FEE_LAMPORTS),
  contractAddress: blank(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS),
});

export const oxbowFeeSol = env.feeLamports / LAMPORTS_PER_SOL;
export const networkLabel = env.cluster === 'mainnet-beta' ? 'Solana mainnet' : 'Solana devnet';
