import { describe, expect, it } from 'vitest';
import { extractWallets } from '../src/tracker/wallet-list';
import { addr, sig } from './fixtures';

describe('wallet lists', () => {
  it('reads plain lists with optional labels', () => {
    const [a, b] = [addr(), addr()];
    expect(extractWallets(`# my wallets\n${a} Trader A\n\n${b}\n${a} again`)).toEqual([{ address: a, label: 'Trader A' }, { address: b }]);
  });

  it('pulls addresses out of pasted pages and CSVs, skipping signatures and shortened ones', () => {
    const [a, b, c] = [addr(), addr(), addr()];
    const page = [`1  ${a}  +$12.3K  65%  Smart Money`, `${b},${c},42`, `tx ${sig()}`, `5w4A…2Du9 short`, `${a.slice(0, 40)}x0O garbage`].join('\n');
    expect(extractWallets(page)).toEqual([{ address: a }, { address: b }, { address: c }]);
  });
});
