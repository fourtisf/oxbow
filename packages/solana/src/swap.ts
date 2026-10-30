/**
 * Turns Jupiter's swap instructions into one unsigned v0 transaction for the
 * trader's wallet, with Oxbow's fee as a plain SOL transfer at the end.
 *
 * The instructions come from an outside API and the trader signs what we
 * hand over, so only known programs are let through: Jupiter's router, the
 * token programs, the associated-token program, the system program and the
 * compute budget program. Anything else and the swap is refused.
 */
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

/** Jupiter's v6 aggregator program, the router every Jupiter swap API route goes through. */
export const JUPITER_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

const ALLOWED = new Set(
  [JUPITER_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, ComputeBudgetProgram.programId].map((p) =>
    p.toBase58(),
  ),
);

/** Largest transaction the network accepts, in bytes. */
export const MAX_TX_BYTES = 1232;
/** Compute for the fee transfer, on top of what Jupiter simulated. */
const FEE_TRANSFER_CU = 1_000;
/** setComputeUnitLimit's instruction tag in the compute budget program. */
const SET_CU_LIMIT = 2;

export interface JupiterInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  /** Base64. */
  data: string;
}

/** The parts of Jupiter's `/swap/v1/swap-instructions` response we use. */
export interface JupiterSwapInstructions {
  computeBudgetInstructions: JupiterInstruction[];
  setupInstructions: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[] | null;
  addressLookupTableAddresses: string[];
  computeUnitLimit?: number | null;
}

export class SwapAssemblyError extends Error {
  constructor(readonly code: 'unknown_program' | 'tx_too_large' | 'bad_instruction') {
    super(code);
  }
}

export function toInstruction(ix: JupiterInstruction): TransactionInstruction {
  if (!ALLOWED.has(ix.programId)) throw new SwapAssemblyError('unknown_program');
  try {
    return new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
      data: Buffer.from(ix.data, 'base64'),
    });
  } catch {
    throw new SwapAssemblyError('bad_instruction');
  }
}

export interface ComposeSwapParams {
  payer: PublicKey;
  ixs: JupiterSwapInstructions;
  lookupTables: AddressLookupTableAccount[];
  blockhash: string;
  /** Oxbow's fee: lamports sent from the payer to the treasury after the swap. */
  fee?: { to: PublicKey; lamports: bigint } | null;
}

export function composeSwapTx(p: ComposeSwapParams): VersionedTransaction {
  if (p.ixs.swapInstruction.programId !== JUPITER_PROGRAM_ID.toBase58()) throw new SwapAssemblyError('unknown_program');
  const fee = p.fee && p.fee.lamports > 0n ? p.fee : null;
  const budget = p.ixs.computeBudgetInstructions.map(toInstruction).filter((ix) => ix.data[0] !== SET_CU_LIMIT);
  const limit = Math.min(1_400_000, (p.ixs.computeUnitLimit ?? 200_000) + (fee ? FEE_TRANSFER_CU : 0));
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: limit }),
    ...budget,
    ...p.ixs.setupInstructions.map(toInstruction),
    toInstruction(p.ixs.swapInstruction),
    ...(p.ixs.cleanupInstruction ? [toInstruction(p.ixs.cleanupInstruction)] : []),
    ...(p.ixs.otherInstructions ?? []).map(toInstruction),
    // Last, so a sale pays the fee out of what it just received.
    ...(fee ? [SystemProgram.transfer({ fromPubkey: p.payer, toPubkey: fee.to, lamports: fee.lamports })] : []),
  ];
  const message = new TransactionMessage({ payerKey: p.payer, recentBlockhash: p.blockhash, instructions }).compileToV0Message(p.lookupTables);
  const tx = new VersionedTransaction(message);
  let size: number;
  try {
    size = tx.serialize().length;
  } catch {
    // web3.js refuses to encode past its own buffer, which is already too large.
    size = Infinity;
  }
  if (size > MAX_TX_BYTES) throw new SwapAssemblyError('tx_too_large');
  return tx;
}

/** Oxbow's cut of `lamports` at `feeBps`, rounded down. */
export const feeOf = (lamports: bigint, feeBps: number): bigint => (lamports * BigInt(feeBps)) / 10_000n;
