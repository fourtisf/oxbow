import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { jupiterPopular } from '../src/popular';

const mint = () => Keypair.generate().publicKey.toBase58();

describe('jupiterPopular', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps verified tokens, drops stablecoins, staked SOL and malformed rows', async () => {
    const bonk = mint();
    const wif = mint();
    const rows = [
      { id: bonk, symbol: 'Bonk', name: 'Bonk', icon: 'https://arweave.net/bonk.png', isVerified: true, tags: ['verified', 'community'] },
      { id: mint(), symbol: 'USDC', name: 'USD Coin', icon: 'https://x.example/usdc.png', isVerified: true },
      { id: mint(), symbol: 'JitoSOL', name: 'Jito Staked SOL', isVerified: true, tags: ['lst'] },
      { id: mint(), symbol: 'SCAM', name: 'Scam', isVerified: false },
      { id: 'not-a-mint', symbol: 'BAD', name: 'Bad' },
      { id: wif, symbol: '$WIF', name: 'dogwifhat', icon: 'javascript:alert(1)' },
    ];
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(rows), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const got = await jupiterPopular('https://lite-api.jup.ag/')();
    expect(fetchMock.mock.calls[0]![0]).toBe('https://lite-api.jup.ag/tokens/v2/toptraded/24h?limit=50');
    expect(got).toEqual([
      { mint: bonk, symbol: 'Bonk', name: 'Bonk', logoUri: 'https://arweave.net/bonk.png' },
      // An icon that isn't https is dropped, the token kept.
      { mint: wif, symbol: '$WIF', name: 'dogwifhat', logoUri: null },
    ]);
  });

  it('answers no picks when Jupiter is down or changes shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 503 })));
    expect(await jupiterPopular('https://lite-api.jup.ag')()).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tokens: [] }), { status: 200 })));
    expect(await jupiterPopular('https://lite-api.jup.ag')()).toEqual([]);
  });
});
