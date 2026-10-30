import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { composeSwapTx, feeOf, JUPITER_PROGRAM_ID, SwapAssemblyError, type JupiterSwapInstructions } from './swap';

const payer = Keypair.generate().publicKey;
const key = () => Keypair.generate().publicKey.toBase58();
const base = (over: Partial<JupiterSwapInstructions> = {}): JupiterSwapInstructions => ({
  computeBudgetInstructions: [],
  setupInstructions: [],
  swapInstruction: { programId: JUPITER_PROGRAM_ID.toBase58(), accounts: [{ pubkey: payer.toBase58(), isSigner: true, isWritable: true }], data: 'AQID' },
  cleanupInstruction: null,
  otherInstructions: [],
  addressLookupTableAddresses: [],
  computeUnitLimit: 100_000,
  ...over,
});
const blockhash = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

describe('composeSwapTx', () => {
  it('appends the fee transfer and leaves it out when there is no fee', () => {
    const to = Keypair.generate().publicKey;
    const withFee = composeSwapTx({ payer, ixs: base(), lookupTables: [], blockhash, fee: { to, lamports: 123n } });
    const keys = withFee.message.staticAccountKeys.map((k) => k.toBase58());
    expect(keys).toContain(to.toBase58());
    expect(keys).toContain(SystemProgram.programId.toBase58());
    const without = composeSwapTx({ payer, ixs: base(), lookupTables: [], blockhash, fee: { to, lamports: 0n } });
    expect(without.message.staticAccountKeys.map((k) => k.toBase58())).not.toContain(to.toBase58());
  });

  it('refuses instructions for programs outside the allow-list', () => {
    const rogue = { programId: key(), accounts: [], data: '' };
    expect(() => composeSwapTx({ payer, ixs: base({ setupInstructions: [rogue] }), lookupTables: [], blockhash })).toThrow(SwapAssemblyError);
    expect(() => composeSwapTx({ payer, ixs: base({ swapInstruction: { ...base().swapInstruction, programId: SystemProgram.programId.toBase58() } }), lookupTables: [], blockhash })).toThrow(
      'unknown_program',
    );
  });

  it('refuses transactions the network would reject for size', () => {
    const accounts = Array.from({ length: 40 }, () => ({ pubkey: key(), isSigner: false, isWritable: true }));
    expect(() => composeSwapTx({ payer, ixs: base({ swapInstruction: { ...base().swapInstruction, accounts } }), lookupTables: [], blockhash })).toThrow('tx_too_large');
  });

  it('rounds the fee down', () => {
    expect(feeOf(1_000_000_000n, 50)).toBe(5_000_000n);
    expect(feeOf(199n, 50)).toBe(0n);
    expect(new PublicKey(JUPITER_PROGRAM_ID).toBase58()).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  });
});
