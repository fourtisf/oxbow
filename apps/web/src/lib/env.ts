import { z } from 'zod';
import { BASE58_ADDRESS_RE } from '@oxbow/shared';

/**
 * Public (browser-safe) config. Next.js inlines NEXT_PUBLIC_* at build time,
 * so each one has to be referenced by its full name here.
 */
const schema = z.object({
  /** Shown in the hero CA box ("Coming soon" until set). */
  contractAddress: z.string().regex(BASE58_ADDRESS_RE).optional(),
});

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const env = schema.parse({
  contractAddress: blank(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS),
});
