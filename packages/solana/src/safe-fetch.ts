/**
 * Fetches JSON from a URL found in token metadata. Those URLs are chosen by
 * whoever created the token, so the request is locked down: https on the
 * default port only, every resolved address must be public (checked at
 * connect time, so a DNS answer can't swap in an internal address after the
 * check), a few redirects at most, a short timeout and a size cap.
 * Node only.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

function v4Parts(ip: string): number[] | null {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

function isPublicV4(ip: string): boolean {
  const p = v4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!;
  // Embedded IPv4 tail, e.g. ::ffff:10.0.0.1
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4Parts(v4[1]!);
    if (!p) return null;
    s = s.slice(0, -v4[1]!.length) + ((p[0]! << 8) | p[1]!).toString(16) + ':' + ((p[2]! << 8) | p[3]!).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const words = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail].map((w) => parseInt(w, 16));
  return words.length === 8 && words.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffff) ? words : null;
}

function isPublicV6(ip: string): boolean {
  const w = expandV6(ip);
  if (!w) return false;
  if (w.every((x) => x === 0)) return false; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4 inside.
  const mapped = w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff;
  const nat64 = w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return isPublicV4(`${w[6]! >> 8}.${w[6]! & 255}.${w[7]! >> 8}.${w[7]! & 255}`);
  const first = w[0]!;
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && w[1] === 0x0db8) return false; // documentation
  if (first === 0x0100 && w.slice(1, 4).every((x) => x === 0)) return false; // discard 100::/64
  return true;
}

/** True only for addresses on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  return v === 4 ? isPublicV4(ip) : v === 6 ? isPublicV6(ip) : false;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup for the socket that refuses to connect anywhere private. */
function publicLookup(hostname: string, options: { all?: boolean }, cb: LookupCb) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, '');
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return cb(Object.assign(new Error(`refusing to connect to ${hostname}: not a public address`), { code: 'EBLOCKED' }), '');
    }
    if (options.all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}

/** Parses and checks a URL before any request is made. */
export function checkUrl(raw: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return u;
}

function getOnce(u: URL, o: Required<SafeFetchOptions>): Promise<{ status: number; location?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        lookup: publicLookup as unknown as typeof dnsLookup,
        headers: { accept: 'application/json, */*;q=0.5', 'user-agent': 'Oxbow token lookup' },
        timeout: o.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status });
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > o.maxBytes) {
          res.destroy();
          return reject(new Error('response too large'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > o.maxBytes) {
            res.destroy();
            reject(new Error('response too large'));
          } else chunks.push(c);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

/** GET a JSON document from an untrusted https URL. Returns null on any failure. */
export async function fetchJsonSafely(raw: string, opts: SafeFetchOptions = {}): Promise<unknown | null> {
  const o: Required<SafeFetchOptions> = { timeoutMs: 5000, maxBytes: 256 * 1024, maxRedirects: 3, ...opts };
  let u = checkUrl(raw);
  for (let hop = 0; u && hop <= o.maxRedirects; hop++) {
    let res: Awaited<ReturnType<typeof getOnce>>;
    try {
      res = await getOnce(u, o);
    } catch {
      return null;
    }
    if (res.location) {
      u = checkUrl(res.location, u);
      continue;
    }
    if (!res.body) return null;
    try {
      return JSON.parse(res.body.toString('utf8'));
    } catch {
      return null;
    }
  }
  return null;
}
