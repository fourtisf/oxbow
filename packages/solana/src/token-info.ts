/**
 * Reads a token's facts straight from the chain: the mint account (supply,
 * decimals, authorities, Token-2022 extensions) and its metadata (name,
 * symbol, logo) from the Token-2022 metadata extension or the Metaplex
 * metadata account, then the logo from the metadata's JSON file. Works with
 * any RPC endpoint; no indexer needed.
 */
import { clusterApiUrl, Connection, PublicKey, type AccountInfo } from '@solana/web3.js';
import {
  ExtensionType,
  getExtensionData,
  getExtensionTypes,
  getPermanentDelegate,
  getTransferFeeConfig,
  getTransferHook,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import { unpack as unpackTokenMetadata } from '@solana/spl-token-metadata';
import { LogoUriSchema, type TokenInfo } from '@oxbow/shared';

/** Metaplex Token Metadata program. */
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/** The one RPC call this module needs, so tests can pass a stub. */
export interface AccountReader {
  getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null>;
}

/** An RPC connection for `url`, or Solana's public endpoint for the cluster (rate-limited; set your own for production). */
export function rpcReader(url: string | undefined, cluster: 'devnet' | 'mainnet-beta'): AccountReader {
  return new Connection(url || clusterApiUrl(cluster), 'confirmed');
}

export interface LookupOptions {
  /** Fetches the metadata JSON (see safe-fetch.ts). Leave out to skip logos. */
  fetchJson?: (url: string) => Promise<unknown | null>;
  ipfsGateway?: string;
}

export type LookupResult = { status: 'found'; token: TokenInfo } | { status: 'not_found' } | { status: 'not_a_mint' };

interface RawMetadata {
  name: string;
  symbol: string;
  uri: string;
}

/** Strips control characters and padding, and caps the length. Metadata text is untrusted. */
export function cleanText(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, max);
}

/** Decodes the start of a Metaplex metadata account: key, update authority, mint, name, symbol, uri. */
export function decodeMetaplexMetadata(data: Buffer): RawMetadata | null {
  // key (1) + update authority (32) + mint (32)
  let o = 65;
  if (data.length < o || data[0] !== 4) return null;
  const str = (): string | null => {
    if (o + 4 > data.length) return null;
    const len = data.readUInt32LE(o);
    o += 4;
    if (len > 1024 || o + len > data.length) return null;
    const v = data.subarray(o, o + len).toString('utf8');
    o += len;
    return v.replace(/\u0000+$/g, '');
  };
  const name = str();
  const symbol = str();
  const uri = str();
  return name === null || symbol === null || uri === null ? null : { name, symbol, uri };
}

export function metaplexMetadataAddress(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()], TOKEN_METADATA_PROGRAM_ID)[0];
}

/** ipfs:// and ar:// to an https gateway; https kept; anything else dropped. */
export function normalizeUri(raw: unknown, ipfsGateway = DEFAULT_IPFS_GATEWAY): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  let out: string;
  if (/^ipfs:\/\//i.test(v)) out = ipfsGateway.replace(/\/?$/, '/') + v.replace(/^ipfs:\/\/(ipfs\/)?/i, '');
  else if (/^ar:\/\//i.test(v)) out = 'https://arweave.net/' + v.replace(/^ar:\/\//i, '');
  else if (/^https:\/\//i.test(v)) out = v;
  else return null;
  try {
    out = new URL(out).toString();
  } catch {
    return null;
  }
  return LogoUriSchema.safeParse(out).success ? out : null;
}

const isSet = (k: PublicKey | null | undefined) => !!k && !k.equals(PublicKey.default);

/** Looks up `mint` on the chain behind `rpc`. Throws only when the RPC itself fails. */
export async function lookupToken(rpc: AccountReader, mint: string, opts: LookupOptions = {}): Promise<LookupResult> {
  const key = new PublicKey(mint);
  const acct = await rpc.getAccountInfo(key);
  if (!acct) return { status: 'not_found' };
  const program = acct.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : acct.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : null;
  if (!program) return { status: 'not_a_mint' };

  let m: ReturnType<typeof unpackMint>;
  try {
    m = unpackMint(key, acct, program);
  } catch {
    return { status: 'not_a_mint' };
  }

  const extTypes = program === TOKEN_2022_PROGRAM_ID ? getExtensionTypes(m.tlvData) : [];
  const extensions = extTypes.map((t) => ExtensionType[t]).filter((n): n is string => typeof n === 'string');

  // Metadata: Token-2022's own extension first, then the Metaplex account.
  let meta: RawMetadata | null = null;
  const tlvMeta = extTypes.includes(ExtensionType.TokenMetadata) ? getExtensionData(ExtensionType.TokenMetadata, m.tlvData) : null;
  if (tlvMeta) {
    try {
      const t = unpackTokenMetadata(tlvMeta);
      meta = { name: t.name, symbol: t.symbol, uri: t.uri };
    } catch {
      meta = null;
    }
  }
  if (!meta) {
    const mp = await rpc.getAccountInfo(metaplexMetadataAddress(key));
    if (mp && mp.owner.equals(TOKEN_METADATA_PROGRAM_ID)) meta = decodeMetaplexMetadata(mp.data);
  }

  let logoUri: string | null = null;
  const jsonUrl = normalizeUri(meta?.uri, opts.ipfsGateway);
  if (jsonUrl && opts.fetchJson) {
    const json = await opts.fetchJson(jsonUrl);
    if (json && typeof json === 'object') logoUri = normalizeUri((json as { image?: unknown }).image, opts.ipfsGateway);
  }

  const fee = getTransferFeeConfig(m);
  const hook = getTransferHook(m);
  const delegate = getPermanentDelegate(m);
  const symbol = cleanText(meta?.symbol ?? '', 32) || `${mint.slice(0, 4)}…`;
  const name = cleanText(meta?.name ?? '', 64);

  return {
    status: 'found',
    token: {
      mint,
      symbol,
      name,
      decimals: m.decimals,
      supply: Number(m.supply) / 10 ** m.decimals,
      tokenProgram: program === TOKEN_2022_PROGRAM_ID ? 'token-2022' : 'spl-token',
      mintAuthority: m.mintAuthority?.toBase58() ?? null,
      freezeAuthority: m.freezeAuthority?.toBase58() ?? null,
      logoUri,
      extensions,
      risk: {
        mintable: !!m.mintAuthority,
        freezable: !!m.freezeAuthority,
        transferFee: !!fee && (fee.newerTransferFee.transferFeeBasisPoints > 0 || fee.olderTransferFee.transferFeeBasisPoints > 0),
        transferHook: isSet(hook?.programId),
        permanentDelegate: isSet(delegate?.delegate),
      },
      // The caller knows which symbols are already listed.
      symbolTaken: false,
      // Needs a transaction history scan; the API indexer fills it in later.
      createdAt: null,
    },
  };
}
