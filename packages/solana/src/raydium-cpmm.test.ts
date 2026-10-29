import { describe, expect, it } from 'vitest';
import { ComputeBudgetProgram, Keypair, PublicKey, SystemInstruction, SystemProgram, TransactionInstruction, VersionedTransaction, type AccountInfo } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { CpmmConfigInfoLayout, CpmmPoolInfoLayout, getCpmmPdaAmmConfigId } from '@raydium-io/raydium-sdk-v2';
import {
  buildBurnLpTx,
  buildCreatePoolTx,
  CPMM_INITIALIZE,
  cpmmProgram,
  decodeCpmmPool,
  orderMints,
  poolAddress,
  readCpmmConfigs,
  supportMintAccounts,
  type CpmmConfig,
} from './raydium-cpmm';

const { programId, feeAccount } = cpmmProgram('devnet');
const key = () => Keypair.generate().publicKey;

function configAccount(index: number, tradeFeeRate: number, opts: { disabled?: boolean; owner?: PublicKey } = {}): AccountInfo<Buffer> {
  const data = Buffer.alloc(CpmmConfigInfoLayout.span);
  CpmmConfigInfoLayout.encode(
    {
      bump: 255,
      disableCreatePool: !!opts.disabled,
      index,
      tradeFeeRate: new BN(tradeFeeRate),
      protocolFeeRate: new BN(120_000),
      fundFeeRate: new BN(40_000),
      createPoolFee: new BN(150_000_000),
      protocolOwner: key(),
      fundOwner: key(),
      creatorFeeRate: new BN(0),
      creatorFeeShareRate: new BN(0),
    } as never,
    data,
  );
  return { owner: opts.owner ?? programId, data, executable: false, lamports: 1, rentEpoch: 0 };
}

const toIx = (tx: VersionedTransaction) => {
  const m = tx.message;
  const keys = m.staticAccountKeys;
  return m.compiledInstructions.map(
    (c) =>
      new TransactionInstruction({
        programId: keys[c.programIdIndex]!,
        keys: c.accountKeyIndexes.map((i) => ({ pubkey: keys[i]!, isSigner: m.isAccountSigner(i), isWritable: m.isAccountWritable(i) })),
        data: Buffer.from(c.data),
      }),
  );
};

describe('readCpmmConfigs', () => {
  it('keeps enabled configs with whole basis points, cheapest first', async () => {
    const ids = Array.from({ length: 6 }, (_, i) => getCpmmPdaAmmConfigId(programId, i).publicKey.toBase58());
    const accounts: Record<string, AccountInfo<Buffer>> = {
      [ids[0]!]: configAccount(0, 10_000),
      [ids[1]!]: configAccount(1, 2_500),
      [ids[2]!]: configAccount(2, 20_000, { disabled: true }),
      [ids[3]!]: configAccount(3, 3_333),
      [ids[4]!]: configAccount(4, 40_000, { owner: key() }),
    };
    const rpc = { getMultipleAccountsInfo: async (ks: PublicKey[]) => ks.map((k) => accounts[k.toBase58()] ?? null) };
    const configs = await readCpmmConfigs(rpc, 'devnet', 6);
    expect(configs).toEqual([
      { id: ids[1], index: 1, feeBps: 25, createPoolFeeLamports: 150_000_000n },
      { id: ids[0], index: 0, feeBps: 100, createPoolFeeLamports: 150_000_000n },
    ]);
  });
});

describe('buildCreatePoolTx', () => {
  const config: CpmmConfig = { id: getCpmmPdaAmmConfigId(programId, 0).publicKey.toBase58(), index: 0, feeBps: 100, createPoolFeeLamports: 150_000_000n };
  const creator = key();
  const treasury = key();
  const meme = key().toBase58();

  it('wraps SOL, creates the pool, pays the Oxbow fee and unwraps, in one transaction', () => {
    const built = buildCreatePoolTx({
      cluster: 'devnet',
      creator: creator.toBase58(),
      base: { mint: meme, tokenProgram: 'spl-token', amount: 1_000_000_000n },
      quote: { mint: NATIVE_MINT.toBase58(), tokenProgram: 'spl-token', amount: 2_000_000_000n },
      config,
      oxbowFee: { treasury: treasury.toBase58(), lamports: 100_000_000n },
      recentBlockhash: key().toBase58(),
      priorityMicroLamports: 10_000,
    });
    const tx = VersionedTransaction.deserialize(built.transaction);
    expect(tx.message.staticAccountKeys[0]!.equals(creator)).toBe(true);
    expect(tx.message.header.numRequiredSignatures).toBe(1);

    const ix = toIx(tx);
    const programs = ix.map((i) => i.programId.toBase58());
    expect(programs[0]).toBe(ComputeBudgetProgram.programId.toBase58());
    expect(programs[1]).toBe(ComputeBudgetProgram.programId.toBase58());

    const init = ix.find((i) => i.programId.equals(programId))!;
    expect(init.data.subarray(0, 8).equals(CPMM_INITIALIZE)).toBe(true);
    expect(init.keys[0]!.pubkey.equals(creator)).toBe(true);
    expect(init.keys[0]!.isSigner).toBe(true);
    expect(init.keys[1]!.pubkey.toBase58()).toBe(config.id);
    expect(init.keys[3]!.pubkey.toBase58()).toBe(built.pool);
    expect(init.keys[12]!.pubkey.equals(feeAccount)).toBe(true);
    expect(built.pool).toBe(poolAddress('devnet', config.id, meme, NATIVE_MINT.toBase58()).pool);

    // Amounts follow Raydium's mint order.
    const [a] = orderMints({ mint: meme, amount: 1_000_000_000n }, { mint: NATIVE_MINT.toBase58(), amount: 2_000_000_000n });
    const amountA = new BN(init.data.subarray(8, 16), 'le').toString();
    const amountB = new BN(init.data.subarray(16, 24), 'le').toString();
    expect(amountA).toBe(a.amount.toString());
    expect(BigInt(amountA) + BigInt(amountB)).toBe(3_000_000_000n);
    expect(built.mintA).toBe(a.mint);

    // SOL wrap before, Oxbow fee and unwrap after.
    const transfers = ix.filter((i) => i.programId.equals(SystemProgram.programId)).map((i) => SystemInstruction.decodeTransfer(i));
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, creator);
    expect(transfers).toEqual([
      { fromPubkey: creator, toPubkey: wsolAta, lamports: 2_000_000_000n },
      { fromPubkey: creator, toPubkey: treasury, lamports: 100_000_000n },
    ]);
    const initAt = ix.indexOf(init);
    const feeAt = ix.findIndex((i) => i.programId.equals(SystemProgram.programId) && SystemInstruction.decodeTransfer(i).toPubkey.equals(treasury));
    expect(feeAt).toBeGreaterThan(initAt);
    expect(ix.at(-1)!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it('adds Raydium’s support-mint account only for whitelisted Token-2022 sides, and no SOL handling without SOL', () => {
    const stock = key().toBase58();
    const usdc = key().toBase58();
    const built = buildCreatePoolTx({
      cluster: 'devnet',
      creator: creator.toBase58(),
      base: { mint: meme, tokenProgram: 'spl-token', amount: 5n },
      quote: { mint: stock, tokenProgram: 'token-2022', amount: 7n },
      config,
      oxbowFee: { treasury: treasury.toBase58(), lamports: 0n },
      recentBlockhash: key().toBase58(),
      supportedMintExt: [stock],
    });
    const ix = toIx(VersionedTransaction.deserialize(built.transaction));
    const init = ix.find((i) => i.programId.equals(programId))!;
    const [support] = supportMintAccounts('devnet', [{ mint: stock, tokenProgram: 'token-2022', amount: 7n }]);
    expect(init.keys.at(-1)!.pubkey.equals(support!.account)).toBe(true);
    expect(init.keys.some((k) => k.pubkey.equals(TOKEN_2022_PROGRAM_ID))).toBe(true);
    expect(ix.some((i) => i.programId.equals(SystemProgram.programId))).toBe(false);
    expect(() =>
      buildCreatePoolTx({ cluster: 'devnet', creator: creator.toBase58(), base: { mint: usdc, tokenProgram: 'spl-token', amount: 1n }, quote: { mint: usdc, tokenProgram: 'spl-token', amount: 1n }, config, oxbowFee: { treasury: treasury.toBase58(), lamports: 0n }, recentBlockhash: key().toBase58() }),
    ).toThrow('same_mint');
  });

  it('builds the LP burn for the creator', () => {
    const lpMint = key();
    const tx = VersionedTransaction.deserialize(buildBurnLpTx({ creator: creator.toBase58(), lpMint: lpMint.toBase58(), amount: 999n, decimals: 9, recentBlockhash: key().toBase58() }));
    const [burn] = toIx(tx);
    expect(burn!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(burn!.keys[0]!.pubkey.equals(getAssociatedTokenAddressSync(lpMint, creator))).toBe(true);
    expect(burn!.keys[1]!.pubkey.equals(lpMint)).toBe(true);
  });
});

describe('decodeCpmmPool', () => {
  it('reads the pool fields the register check needs', () => {
    const f = { configId: key(), poolCreator: key(), vaultA: key(), vaultB: key(), mintLp: key(), mintA: key(), mintB: key() };
    const data = Buffer.alloc(CpmmPoolInfoLayout.span);
    CpmmPoolInfoLayout.encode(
      {
        ...f,
        mintProgramA: TOKEN_PROGRAM_ID,
        mintProgramB: TOKEN_2022_PROGRAM_ID,
        observationId: key(),
        bump: 1,
        status: 0,
        lpDecimals: 9,
        mintDecimalA: 6,
        mintDecimalB: 8,
        lpAmount: new BN('123456789'),
        protocolFeesMintA: new BN(0),
        protocolFeesMintB: new BN(0),
        fundFeesMintA: new BN(0),
        fundFeesMintB: new BN(0),
        openTime: new BN(1_790_000_000),
        epoch: new BN(1),
        feeOn: 0,
        enableCreatorFee: false,
        creatorFeesMintA: new BN(0),
        creatorFeesMintB: new BN(0),
      } as never,
      data,
    );
    expect(decodeCpmmPool(data)).toMatchObject({
      creator: f.poolCreator.toBase58(),
      lpMint: f.mintLp.toBase58(),
      mintA: f.mintA.toBase58(),
      decimalsB: 8,
      lpAmount: 123456789n,
      mintProgramB: TOKEN_2022_PROGRAM_ID.toBase58(),
    });
    expect(decodeCpmmPool(Buffer.alloc(10))).toBeNull();
  });
});
