import { describe, expect, it, vi } from 'vitest';

// Every hostname resolves to a private address, as a hostile DNS answer would.
vi.mock('node:dns', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:dns')>();
  return {
    ...real,
    lookup: vi.fn((_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '10.0.0.7', family: 4 }])),
  };
});

const { checkUrl, fetchJsonSafely, isPublicAddress } = await import('./safe-fetch');

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each([
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
    '64:ff9b::a00:1',
    'not-an-ip',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('checkUrl', () => {
  it('allows plain https URLs', () => {
    expect(checkUrl('https://arweave.net/abc')?.hostname).toBe('arweave.net');
  });
  it.each([
    'http://arweave.net/abc',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://169.254.169.254/latest/meta-data',
    'https://example.com:8443/x',
    'https://user:pw@example.com/x',
    'https://localhost/x',
    'https://printer.local/x',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s', (u) => expect(checkUrl(u)).toBeNull());
});

describe('fetchJsonSafely', () => {
  it('refuses to connect when the host resolves to a private address', async () => {
    await expect(fetchJsonSafely('https://metadata.example/token.json', { timeoutMs: 2000 })).resolves.toBeNull();
    const dns = await import('node:dns');
    expect(dns.lookup).toHaveBeenCalled();
  });
  it('rejects bad URLs without a request', async () => {
    await expect(fetchJsonSafely('http://metadata.example/token.json')).resolves.toBeNull();
  });
});
