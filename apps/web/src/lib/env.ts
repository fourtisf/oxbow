import { z } from 'zod';
import { BASE58_ADDRESS_RE } from '@oxbow/shared';

/**
 * Public (browser-safe) config. Next.js inlines NEXT_PUBLIC_* at build time,
 * so each one has to be referenced by its full name here.
 */
const schema = z.object({
  /** Oxbow's token, shown in the hero, nav and footer with a copy button. */
  contractAddress: z.string().regex(BASE58_ADDRESS_RE).optional(),
});

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** The $OXBOW token (pump.fun, Token-2022, mint and freeze authority revoked). NEXT_PUBLIC_CONTRACT_ADDRESS overrides it. */
const OFFICIAL_CA = 'DaDNDwPGvVhNWQi4mchx3rqtRaJmEU96n7XAUoJbpump';

export const env = schema.parse({
  contractAddress: blank(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) ?? OFFICIAL_CA,
});
