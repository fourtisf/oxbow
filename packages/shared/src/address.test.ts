import { describe, expect, it } from 'vitest';
import { bytesToBase58 } from './address';

describe('bytesToBase58', () => {
  it('encodes like every Solana tool', () => {
    expect(bytesToBase58(new Uint8Array(32))).toBe('11111111111111111111111111111111');
    expect(bytesToBase58(Uint8Array.from([0, 0, 1]))).toBe('112');
    expect(bytesToBase58(Uint8Array.from([255, 255]))).toBe('LUv');
    expect(bytesToBase58(new TextEncoder().encode('hello world'))).toBe('StV1DL6CwTryKyV');
  });
});
