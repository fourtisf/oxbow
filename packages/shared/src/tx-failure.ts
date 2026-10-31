/**
 * Why a Solana transaction was refused, from whatever text explains it: a
 * simulation's error and logs, the node's answer to a send, or a wallet's
 * message. The swap programs' own words are matched where they exist:
 * Jupiter's SlippageToleranceExceeded (6001, 0x1771), pump.fun's "slippage:
 * Too much SOL required" / "Too little SOL received" (6002, 6003) and
 * PumpSwap's ExceededSlippage (6004).
 */
export type TxFailure = 'slippage' | 'insufficient_sol' | 'expired' | 'failed';

export function txFailure(text: string): TxFailure {
  if (/blockhash not found|block height exceeded|BlockhashNotFound|blockhash.*expired/i.test(text)) return 'expired';
  if (/slippage|0x177[1-4]\b|"Custom":\s*600[1-4]\b|TooMuchSolRequired|TooLittleSolReceived/i.test(text)) return 'slippage';
  if (/insufficient lamports|insufficient funds|InsufficientFunds|no record of a prior credit|custom program error: 0x1\b|"Custom":\s*1\}/i.test(text)) return 'insufficient_sol';
  return 'failed';
}
