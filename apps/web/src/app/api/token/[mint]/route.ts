import { NextResponse } from 'next/server';
import { isAddress, TokenInfoSchema } from '@oxbow/shared';
import { fetchJsonSafely } from '@oxbow/solana/safe-fetch';
import { lookupToken, rpcReader } from '@oxbow/solana/token';
import { env, networkLabel } from '@/lib/env';

/**
 * GET /api/token/[mint]: a token's name, symbol, logo, supply, authorities and
 * extensions, read from the chain. Used by Create for any mint that isn't one
 * of the sample tokens, so a real token shows its own project's name and logo.
 * Moves to the API service in M2.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RPC_URL is server-only, so a keyed provider URL (e.g. Helius) never reaches the browser.
const rpc = rpcReader(process.env.RPC_URL || env.rpcUrl, env.cluster);

type Entry = { at: number; status: number; body: unknown };
const cache = new Map<string, Entry>();
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

// Each lookup costs RPC calls and a metadata fetch: cap it per visitor.
const hits = new Map<string, { start: number; n: number }>();
const WINDOW_MS = 60_000;
const PER_WINDOW = 30;

function limited(req: Request): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    if (hits.size > 10_000) hits.clear();
    hits.set(ip, { start: now, n: 1 });
    return false;
  }
  return ++h.n > PER_WINDOW;
}

function respond(e: Entry) {
  return NextResponse.json(e.body, {
    status: e.status,
    headers: { 'cache-control': e.status === 200 ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60' },
  });
}

export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const { mint } = params;
  if (!isAddress(mint)) return NextResponse.json({ error: 'bad_mint' }, { status: 400 });

  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < CACHE_MS) return respond(hit);
  if (limited(req)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });

  let entry: Entry;
  try {
    const r = await lookupToken(rpc, mint, { fetchJson: (u) => fetchJsonSafely(u), ipfsGateway: process.env.IPFS_GATEWAY || undefined });
    if (r.status === 'found') {
      const token = TokenInfoSchema.safeParse(r.token);
      if (!token.success) return NextResponse.json({ error: 'unreadable_metadata' }, { status: 502 });
      entry = { at: Date.now(), status: 200, body: token.data };
    } else {
      entry = { at: Date.now(), status: 404, body: { error: r.status, network: networkLabel } };
    }
  } catch {
    // RPC down or unreachable: not cached, so the next try asks again.
    return NextResponse.json({ error: 'rpc_unavailable' }, { status: 502 });
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(mint, entry);
  return respond(entry);
}
