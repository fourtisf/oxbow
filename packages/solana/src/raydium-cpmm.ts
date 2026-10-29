/**
 * Raydium CPMM: fee tiers read from the chain, and the pool-creation
 * transaction Oxbow hands to the creator's wallet. Program ids and account
 * layouts come from Raydium's SDK (@raydium-io/raydium-sdk-v2); nothing here
 * hard-codes an address.
 *
 * The transaction, in order: compute budget, wrap SOL if a side is SOL,
 * Raydium's initialize (deposits both sides, mints LP to the creator), the
 * Oxbow fee to the treasury, and closing the temporary wrapped-SOL account.
 * One signature, all or nothing.
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BN from 'bn.js';
import {
  CpmmConfigInfoLayout,
  CpmmPoolInfoLayout,
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  getCreatePoolKeys,
  getPdaMintExAccountCp,
  makeCreateCpmmPoolInInstruction,
} from '@raydium-io/raydium-sdk-v2';
import type { Cluster } from './rpc';

/** Anchor discriminator of CPMM `initialize` (the SDK's instruction encoder writes the same bytes). */
export const CPMM_INITIALIZE = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

export function cpmmProgram(cluster: Cluster): { programId: PublicKey; feeAccount: PublicKey } {
  return cluster === 'devnet'
    ? { programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, feeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC }
    : { programId: CREATE_CPMM_POOL_PROGRAM, feeAccount: CREATE_CPMM_POOL_FEE_ACC };
}

export interface CpmmConfig {
  id: string;
  index: number;
  /** Trading fee in basis points (the config stores millionths). */
  feeBps: number;
  /** What Raydium charges to create a pool, in lamports. */
  createPoolFeeLamports: bigint;
}

export interface MultiReader {
  getMultipleAccountsInfo(keys: PublicKey[]): Promise<(AccountInfo<Buffer> | null)[]>;
}

/** Fee configs with index 0..`max`-1 that exist and accept new pools, cheapest first. */
export async function readCpmmConfigs(rpc: MultiReader, cluster: Cluster, max = 16): Promise<CpmmConfig[]> {
  const { programId } = cpmmProgram(cluster);
  const ids = Array.from({ length: max }, (_, i) => getCpmmPdaAmmConfigId(programId, i).publicKey);
  const accounts = await rpc.getMultipleAccountsInfo(ids);
  const out: CpmmConfig[] = [];
  accounts.forEach((a, i) => {
    if (!a || !a.owner.equals(programId) || a.data.length < CpmmConfigInfoLayout.span) return;
    const c = CpmmConfigInfoLayout.decode(a.data);
    if (c.disableCreatePool) return;
    const rate = Number(c.tradeFeeRate.toString());
    // Only whole basis points map onto Oxbow's fee tiers.
    if (rate % 100 !== 0) return;
    out.push({ id: ids[i]!.toBase58(), index: c.index, feeBps: rate / 100, createPoolFeeLamports: BigInt(c.createPoolFee.toString()) });
  });
  return out.sort((a, b) => a.feeBps - b.feeBps || a.index - b.index);
}

/** Trading fee of a config account, in basis points (null when the data isn't a CPMM config). */
export function cpmmConfigFeeBps(data: Buffer): number | null {
  if (data.length < CpmmConfigInfoLayout.span) return null;
  return Number(CpmmConfigInfoLayout.decode(data).tradeFeeRate.toString()) / 100;
}

export interface SideInput {
  mint: string;
  /** "spl-token" or "token-2022" */
  tokenProgram: 'spl-token' | 'token-2022';
  /** Raw amount (base units). */
  amount: bigint;
}

export interface BuildCreateArgs {
  cluster: Cluster;
  creator: string;
  base: SideInput;
  quote: SideInput;
  config: CpmmConfig;
  /** Oxbow's fee, sent to the treasury in the same transaction. */
  oxbowFee: { treasury: string; lamports: bigint };
  recentBlockhash: string;
  /** Token-2022 mints Raydium has whitelisted (their support-mint account exists). */
  supportedMintExt?: string[];
  /** Priority fee in micro-lamports per compute unit. */
  priorityMicroLamports?: number;
}

export interface BuiltCreate {
  /** Unsigned v0 transaction for the creator's wallet. */
  transaction: Uint8Array;
  pool: string;
  lpMint: string;
  mintA: string;
  mintB: string;
}

const programOf = (p: SideInput['tokenProgram']) => (p === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** Raydium orders the pair by mint bytes; the pool address depends on that order. */
export function orderMints<T extends { mint: string }>(a: T, b: T): [T, T] {
  return Buffer.compare(new PublicKey(a.mint).toBuffer(), new PublicKey(b.mint).toBuffer()) <= 0 ? [a, b] : [b, a];
}

export function poolAddress(cluster: Cluster, configId: string, mintX: string, mintY: string): { pool: string; lpMint: string } {
  const { programId } = cpmmProgram(cluster);
  const [a, b] = orderMints({ mint: mintX }, { mint: mintY });
  const keys = getCreatePoolKeys({ programId, configId: new PublicKey(configId), mintA: new PublicKey(a.mint), mintB: new PublicKey(b.mint) });
  return { pool: keys.poolId.toBase58(), lpMint: keys.lpMint.toBase58() };
}

/** Support-mint accounts to check for the Token-2022 sides (pass the ones that exist as `supportedMintExt`). */
export function supportMintAccounts(cluster: Cluster, mints: SideInput[]): { mint: string; account: PublicKey }[] {
  const { programId } = cpmmProgram(cluster);
  return mints.filter((m) => m.tokenProgram === 'token-2022').map((m) => ({ mint: m.mint, account: getPdaMintExAccountCp(programId, new PublicKey(m.mint)).publicKey }));
}

export function buildCreatePoolTx(args: BuildCreateArgs): BuiltCreate {
  if (args.base.mint === args.quote.mint) throw new Error('same_mint');
  if (args.base.amount <= 0n || args.quote.amount <= 0n) throw new Error('zero_amount');
  const { programId, feeAccount } = cpmmProgram(args.cluster);
  const creator = new PublicKey(args.creator);
  const [a, b] = orderMints(args.base, args.quote);
  const mintA = new PublicKey(a.mint);
  const mintB = new PublicKey(b.mint);
  const keys = getCreatePoolKeys({ programId, configId: new PublicKey(args.config.id), mintA, mintB });

  const ix: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })];
  if (args.priorityMicroLamports) ix.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: args.priorityMicroLamports }));

  // The creator's token accounts for each side. SOL is wrapped into a temporary account and unwrapped after.
  const vault = (side: SideInput) => {
    const mint = new PublicKey(side.mint);
    const ata = getAssociatedTokenAddressSync(mint, creator, false, programOf(side.tokenProgram));
    if (mint.equals(NATIVE_MINT)) {
      ix.push(
        createAssociatedTokenAccountIdempotentInstruction(creator, ata, creator, NATIVE_MINT),
        SystemProgram.transfer({ fromPubkey: creator, toPubkey: ata, lamports: side.amount }),
        createSyncNativeInstruction(ata),
      );
    }
    return ata;
  };
  const userVaultA = vault(a);
  const userVaultB = vault(b);

  const ext = new Set(args.supportedMintExt ?? []);
  const supportAccounts = supportMintAccounts(args.cluster, [a, b])
    .filter((s) => ext.has(s.mint))
    .map((s) => s.account);

  ix.push(
    makeCreateCpmmPoolInInstruction(
      programId,
      creator,
      new PublicKey(args.config.id),
      keys.authority,
      keys.poolId,
      mintA,
      mintB,
      keys.lpMint,
      userVaultA,
      userVaultB,
      getAssociatedTokenAddressSync(keys.lpMint, creator),
      keys.vaultA,
      keys.vaultB,
      feeAccount,
      programOf(a.tokenProgram),
      programOf(b.tokenProgram),
      keys.observationId,
      new BN(a.amount.toString()),
      new BN(b.amount.toString()),
      new BN(0),
      supportAccounts,
    ),
  );

  if (args.oxbowFee.lamports > 0n) {
    ix.push(SystemProgram.transfer({ fromPubkey: creator, toPubkey: new PublicKey(args.oxbowFee.treasury), lamports: args.oxbowFee.lamports }));
  }
  for (const side of [a, b]) {
    if (side.mint === NATIVE_MINT.toBase58()) {
      ix.push(createCloseAccountInstruction(getAssociatedTokenAddressSync(NATIVE_MINT, creator), creator, creator));
    }
  }

  const message = new TransactionMessage({ payerKey: creator, recentBlockhash: args.recentBlockhash, instructions: ix }).compileToV0Message();
  return {
    transaction: new VersionedTransaction(message).serialize(),
    pool: keys.poolId.toBase58(),
    lpMint: keys.lpMint.toBase58(),
    mintA: a.mint,
    mintB: b.mint,
  };
}

/** Burns `amount` LP tokens from the creator's LP account (classic SPL mint, set by Raydium). */
export function buildBurnLpTx(args: { creator: string; lpMint: string; amount: bigint; decimals: number; recentBlockhash: string }): Uint8Array {
  const creator = new PublicKey(args.creator);
  const lpMint = new PublicKey(args.lpMint);
  const ata = getAssociatedTokenAddressSync(lpMint, creator);
  const message = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: args.recentBlockhash,
    instructions: [createBurnCheckedInstruction(ata, lpMint, creator, args.amount, args.decimals)],
  }).compileToV0Message();
  return new VersionedTransaction(message).serialize();
}

export interface CpmmPoolState {
  configId: string;
  creator: string;
  vaultA: string;
  vaultB: string;
  lpMint: string;
  mintA: string;
  mintB: string;
  mintProgramA: string;
  mintProgramB: string;
  decimalsA: number;
  decimalsB: number;
  lpDecimals: number;
  /** LP supply the pool tracks (raw). */
  lpAmount: bigint;
  openTime: number;
}

export function decodeCpmmPool(data: Buffer): CpmmPoolState | null {
  if (data.length < CpmmPoolInfoLayout.span) return null;
  const p = CpmmPoolInfoLayout.decode(data);
  return {
    configId: p.configId.toBase58(),
    creator: p.poolCreator.toBase58(),
    vaultA: p.vaultA.toBase58(),
    vaultB: p.vaultB.toBase58(),
    lpMint: p.mintLp.toBase58(),
    mintA: p.mintA.toBase58(),
    mintB: p.mintB.toBase58(),
    mintProgramA: p.mintProgramA.toBase58(),
    mintProgramB: p.mintProgramB.toBase58(),
    decimalsA: p.mintDecimalA,
    decimalsB: p.mintDecimalB,
    lpDecimals: p.lpDecimals,
    lpAmount: BigInt(p.lpAmount.toString()),
    openTime: Number(p.openTime.toString()),
  };
}
