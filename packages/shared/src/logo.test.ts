import { describe, expect, it } from 'vitest';
import { LogoUriSchema } from './schemas';

describe('LogoUriSchema', () => {
  it.each(['https://arweave.net/abc123', 'https://ipfs.io/ipfs/bafy/logo.png', '/tokens/sol.svg'])('accepts %s', (v) => {
    expect(LogoUriSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    'http://example.com/logo.png',
    'ipfs://bafy/logo.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'javascript:alert(1)',
    '//evil.example/logo.png',
    'tokens/sol.svg',
    'https://example.com/a"onerror="x',
    '',
  ])('rejects %s', (v) => {
    expect(LogoUriSchema.safeParse(v).success).toBe(false);
  });
});
