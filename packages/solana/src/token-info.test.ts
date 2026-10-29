import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram, type AccountInfo } from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  AccountType,
  ExtensionType,
  MINT_SIZE,
  MintLayout,
  PermanentDelegateLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TransferFeeConfigLayout,
} from '@solana/spl-token';
import { pack as packTokenMetadata } from '@solana/spl-token-metadata';
import { cleanText, decodeMetaplexMetadata, lookupToken, metaplexMetadataAddress, normalizeUri, TOKEN_METADATA_PROGRAM_ID, type AccountReader } from './token-info';

const info = (owner: PublicKey, data: Buffer): AccountInfo<Buffer> => ({ owner, data, executable: false, lamports: 1_461_600, rentEpoch: 0 });

function mintData(opts: { decimals: number; supply: bigint; mintAuthority?: PublicKey; freezeAuthority?: PublicKey }): Buffer {
  const b = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: opts.mintAuthority ? 1 : 0,
      mintAuthority: opts.mintAuthority ?? PublicKey.default,
      supply: opts.supply,
      decimals: opts.decimals,
      isInitialized: true,
      freezeAuthorityOption: opts.freezeAuthority ? 1 : 0,
      freezeAuthority: opts.freezeAuthority ?? PublicKey.default,
    },
    b,
  );
  return b;
}

/** Borsh string padded with NULs to `pad` bytes, the way Metaplex stores fixed-size fields. */
function padded(s: string, pad: number): Buffer {
  const body = Buffer.alloc(pad);
  body.write(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(pad);
  return Buffer.concat([len, body]);
}

function metaplexData(mint: PublicKey, name: string, symbol: string, uri: string): Buffer {
  return Buffer.concat([Buffer.from([4]), Keypair.generate().publicKey.toBuffer(), mint.toBuffer(), padded(name, 32), padded(symbol, 10), padded(uri, 200), Buffer.alloc(40)]);
}

function tlv(type: ExtensionType, value: Buffer): Buffer {
  const h = Buffer.alloc(4);
  h.writeUInt16LE(type, 0);
  h.writeUInt16LE(value.length, 2);
  return Buffer.concat([h, value]);
}

function stub(accounts: Map<string, AccountInfo<Buffer>>): AccountReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getAccountInfo(k: PublicKey) {
      calls.push(k.toBase58());
      return accounts.get(k.toBase58()) ?? null;
    },
  };
}

describe('lookupToken', () => {
  it('reads a classic SPL token with Metaplex metadata and its logo', async () => {
    const mint = Keypair.generate().publicKey;
    const accounts = new Map([
      [mint.toBase58(), info(TOKEN_PROGRAM_ID, mintData({ decimals: 5, supply: 88_000_000_000_000n * 10n ** 5n }))],
      [metaplexMetadataAddress(mint).toBase58(), info(TOKEN_METADATA_PROGRAM_ID, metaplexData(mint, 'Bonk', 'Bonk', 'https://arweave.net/meta.json'))],
    ]);
    const fetched: string[] = [];
    const r = await lookupToken(stub(accounts), mint.toBase58(), {
      fetchJson: async (u) => {
        fetched.push(u);
        return { name: 'ignored', image: 'ipfs://bafyimage/logo.png' };
      },
    });
    expect(fetched).toEqual(['https://arweave.net/meta.json']);
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.token).toMatchObject({
      symbol: 'Bonk',
      name: 'Bonk',
      decimals: 5,
      supply: 88_000_000_000_000,
      tokenProgram: 'spl-token',
      mintAuthority: null,
      freezeAuthority: null,
      logoUri: 'https://ipfs.io/ipfs/bafyimage/logo.png',
      extensions: [],
      risk: { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false },
    });
  });

  it('reads Token-2022 metadata and flags fees, delegates and authorities', async () => {
    const mint = Keypair.generate().publicKey;
    const authority = Keypair.generate().publicKey;
    const fee = Buffer.alloc(108);
    TransferFeeConfigLayout.encode(
      {
        transferFeeConfigAuthority: authority,
        withdrawWithheldAuthority: authority,
        withheldAmount: 0n,
        olderTransferFee: { epoch: 0n, maximumFee: 0n, transferFeeBasisPoints: 0 },
        newerTransferFee: { epoch: 0n, maximumFee: 10n ** 9n, transferFeeBasisPoints: 250 },
      },
      fee,
    );
    const delegate = Buffer.alloc(32);
    PermanentDelegateLayout.encode({ delegate: authority }, delegate);
    const meta = packTokenMetadata({ updateAuthority: authority, mint, name: 'Hooked Cat', symbol: 'HCAT', uri: 'ar://metaTx', additionalMetadata: [] });
    const data = Buffer.concat([
      mintData({ decimals: 9, supply: 10n ** 18n, mintAuthority: authority, freezeAuthority: authority }),
      Buffer.alloc(ACCOUNT_SIZE - MINT_SIZE),
      Buffer.from([AccountType.Mint]),
      tlv(ExtensionType.TransferFeeConfig, fee),
      tlv(ExtensionType.PermanentDelegate, delegate),
      tlv(ExtensionType.TokenMetadata, Buffer.from(meta)),
    ]);
    const rpc = stub(new Map([[mint.toBase58(), info(TOKEN_2022_PROGRAM_ID, data)]]));
    const r = await lookupToken(rpc, mint.toBase58(), { fetchJson: async () => ({ image: 'https://cdn.example.com/cat.png' }) });
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    // Metadata came from the extension, so the Metaplex account was never read.
    expect(rpc.calls).toEqual([mint.toBase58()]);
    expect(r.token).toMatchObject({
      symbol: 'HCAT',
      name: 'Hooked Cat',
      supply: 1_000_000_000,
      tokenProgram: 'token-2022',
      mintAuthority: authority.toBase58(),
      freezeAuthority: authority.toBase58(),
      logoUri: 'https://cdn.example.com/cat.png',
      extensions: ['TransferFeeConfig', 'PermanentDelegate', 'TokenMetadata'],
      risk: { mintable: true, freezable: true, transferFee: true, transferHook: false, permanentDelegate: true },
    });
  });

  it('falls back to a short mint when there is no metadata, and never invents a logo', async () => {
    const mint = Keypair.generate().publicKey;
    const r = await lookupToken(stub(new Map([[mint.toBase58(), info(TOKEN_PROGRAM_ID, mintData({ decimals: 0, supply: 7n }))]])), mint.toBase58(), {
      fetchJson: async () => ({ image: 'https://should.not/be-used.png' }),
    });
    expect(r.status === 'found' && r.token).toMatchObject({ symbol: `${mint.toBase58().slice(0, 4)}…`, name: '', logoUri: null, supply: 7 });
  });

  it('tells missing accounts apart from accounts that are not mints', async () => {
    const mint = Keypair.generate().publicKey;
    expect(await lookupToken(stub(new Map()), mint.toBase58())).toEqual({ status: 'not_found' });
    const wallet = stub(new Map([[mint.toBase58(), info(SystemProgram.programId, Buffer.alloc(0))]]));
    expect(await lookupToken(wallet, mint.toBase58())).toEqual({ status: 'not_a_mint' });
    const tokenAccount = stub(new Map([[mint.toBase58(), info(TOKEN_PROGRAM_ID, Buffer.alloc(ACCOUNT_SIZE))]]));
    expect(await lookupToken(tokenAccount, mint.toBase58())).toEqual({ status: 'not_a_mint' });
  });

  it('drops logos that are not https', async () => {
    const mint = Keypair.generate().publicKey;
    const accounts = new Map([
      [mint.toBase58(), info(TOKEN_PROGRAM_ID, mintData({ decimals: 6, supply: 1n }))],
      [metaplexMetadataAddress(mint).toBase58(), info(TOKEN_METADATA_PROGRAM_ID, metaplexData(mint, 'X', 'X', 'https://a.example/m.json'))],
    ]);
    for (const image of ['http://a.example/x.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 42]) {
      const r = await lookupToken(stub(accounts), mint.toBase58(), { fetchJson: async () => ({ image }) });
      expect(r.status === 'found' && r.token.logoUri).toBeNull();
    }
  });
});

describe('metadata helpers', () => {
  it('rejects metadata accounts with the wrong key or truncated data', () => {
    const mint = Keypair.generate().publicKey;
    const good = metaplexData(mint, 'Name', 'SYM', 'https://x.example/m.json');
    expect(decodeMetaplexMetadata(good)).toEqual({ name: 'Name', symbol: 'SYM', uri: 'https://x.example/m.json' });
    const wrongKey = Buffer.from(good);
    wrongKey[0] = 6;
    expect(decodeMetaplexMetadata(wrongKey)).toBeNull();
    expect(decodeMetaplexMetadata(good.subarray(0, 80))).toBeNull();
  });

  it('rewrites ipfs and arweave links to https and drops the rest', () => {
    expect(normalizeUri('ipfs://bafyabc/meta.json')).toBe('https://ipfs.io/ipfs/bafyabc/meta.json');
    expect(normalizeUri('ipfs://ipfs/bafyabc')).toBe('https://ipfs.io/ipfs/bafyabc');
    expect(normalizeUri('ipfs://bafyabc', 'https://gw.example/ipfs')).toBe('https://gw.example/ipfs/bafyabc');
    expect(normalizeUri('ar://tx123')).toBe('https://arweave.net/tx123');
    expect(normalizeUri(' https://x.example/a.png ')).toBe('https://x.example/a.png');
    for (const bad of ['http://x.example/a.png', 'ftp://x/y', '//x.example/a.png', '', null, {}]) expect(normalizeUri(bad)).toBeNull();
  });

  it('cleans control and direction-override characters out of names', () => {
    expect(cleanText('  Bonk\u0000\u0000 ', 32)).toBe('Bonk');
    expect(cleanText('US‮DC', 32)).toBe('USDC');
    expect(cleanText('x'.repeat(40), 32)).toHaveLength(32);
  });
});
