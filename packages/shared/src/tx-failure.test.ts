import { describe, expect, it } from 'vitest';
import { txFailure } from './tx-failure';

describe('txFailure', () => {
  it('reads slippage from Jupiter, pump.fun and PumpSwap', () => {
    expect(txFailure('Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1771')).toBe('slippage');
    expect(txFailure('Program log: AnchorError occurred. Error Code: TooMuchSolRequired. Error Number: 6002. Error Message: slippage: Too much SOL required to buy the given amount of tokens.')).toBe('slippage');
    expect(txFailure('{"InstructionError":[4,{"Custom":6004}]} Error Code: ExceededSlippage')).toBe('slippage');
  });
  it('reads missing SOL, expired blockhashes, and leaves the rest as failed', () => {
    expect(txFailure('Transfer: insufficient lamports 1000, need 5000')).toBe('insufficient_sol');
    expect(txFailure('Attempt to debit an account but found no record of a prior credit.')).toBe('insufficient_sol');
    expect(txFailure('Blockhash not found')).toBe('expired');
    expect(txFailure('Program failed to complete')).toBe('failed');
  });
});
