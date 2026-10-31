/** Fakes for the API tests: Jupiter, the tracker's JSON-RPC and the web3.js connection. Every address is made for the run. */
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { JUPITER_PROGRAM_ID, JUPITER_TRIGGER_PROGRAM_ID, type JupiterInstruction, type JupiterSwapInstructions } from '@oxbow/solana/swap';
import { JupiterError, type Jupiter, type JupiterQuote, type JupiterToken, type QuoteParams, type TriggerCreate, type TriggerOrder } from '../src/jupiter';
import { WSOL, type RawTx } from '../src/tracker/parse';
import type { History, HistoryOpts, SignatureInfo, TrackerRpc } from '../src/tracker/rpc';
import { addr, fakeSwapTx, sig, type FakeSwap } from './fixtures';

export const NOW = Date.parse('2026-10-30T12:00:00Z');
export const SOL_USD = 200;
export const TREASURY = addr();

export function token(mint: string, over: Partial<JupiterToken> = {}): JupiterToken {
  return {
    mint,
    symbol: 'TKN',
    name: 'Token',
    decimals: 6,
    logoUri: `https://img.example/${mint.slice(0, 6)}.png`,
    verified: true,
    stable: false,
    usdPrice: 1,
    change24h: 0,
    mcap: 5_000_000,
    liquidity: 800_000,
    holderCount: 12_000,
    organicScore: 80,
    mintAuthorityOff: true,
    freezeAuthorityOff: true,
    topHoldersPct: 15,
    devPct: 0,
    launchedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

export const ALT_KEYS = Array.from({ length: 20 }, () => new PublicKey(addr()));
export const ALT = new AddressLookupTableAccount({
  key: new PublicKey(addr()),
  state: { deactivationSlot: BigInt('18446744073709551615'), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: ALT_KEYS },
});

export class FakeJupiter implements Jupiter {
  table: Map<string, JupiterToken>;
  constructor(rows: JupiterToken[]) {
    this.table = new Map(rows.map((t) => [t.mint, t]));
  }
    down = false;
  quotes: QuoteParams[] = [];
  swapProgram = JUPITER_PROGRAM_ID.toBase58();
  trending: string[] = [];
  triggers: TriggerCreate[] = [];
  triggerProgram = JUPITER_TRIGGER_PROGRAM_ID.toBase58();
  /** Set to make createOrder refuse the way Jupiter does. */
  triggerError: string | null = null;
  openOrders: TriggerOrder[] = [];
  async topTraded() {
    return this.trending.flatMap((m) => (this.table.has(m) ? [this.table.get(m)!] : []));
  }
  async createTrigger(p: TriggerCreate) {
    if (this.triggerError) throw new JupiterError(400, this.triggerError);
    this.triggers.push(p);
    return { transaction: triggerTx(p.maker, this.triggerProgram), order: addr() };
  }
  async cancelTrigger(maker: string) {
    return { transaction: triggerTx(maker, this.triggerProgram) };
  }
  async triggerOrders() {
    return this.openOrders;
  }
  async tokens(mints: string[]) {
    if (this.down) throw new Error('down');
    return mints.flatMap((m) => (this.table.has(m) ? [this.table.get(m)!] : []));
  }
  async search(q: string) {
    if (this.down) throw new Error('down');
    return [...this.table.values()].filter((t) => t.symbol.toLowerCase().includes(q.toLowerCase()) || t.mint === q);
  }
  /** Set to make quotes fail with this HTTP status. */
  quoteStatus: number | null = null;
  async quote(p: QuoteParams): Promise<JupiterQuote> {
    if (this.quoteStatus) throw new JupiterError(this.quoteStatus, this.quoteStatus === 429 ? 'Too many requests' : 'No routes found');
    this.quotes.push(p);
    const buy = p.inputMint === WSOL;
    // 1 SOL = 50,000 MEME (6 decimals) both ways.
    const out = buy ? (p.amount * 50_000n * 10n ** 6n) / 10n ** 9n : (p.amount * 10n ** 9n) / (50_000n * 10n ** 6n);
    return {
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      inAmount: p.amount.toString(),
      outAmount: out.toString(),
      otherAmountThreshold: ((out * BigInt(10_000 - p.slippageBps)) / 10_000n).toString(),
      priceImpactPct: '0.0012',
      slippageBps: p.slippageBps,
      routePlan: [{ swapInfo: { label: 'Whirlpool' } }, { swapInfo: { label: 'Raydium' } }],
    };
  }
  async swapInstructions(_q: JupiterQuote, wallet: string): Promise<JupiterSwapInstructions> {
    const ix = (i: ReturnType<typeof ComputeBudgetProgram.setComputeUnitLimit>): JupiterInstruction => ({
      programId: i.programId.toBase58(),
      accounts: i.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
      data: Buffer.from(i.data).toString('base64'),
    });
    return {
      computeBudgetInstructions: [ix(ComputeBudgetProgram.setComputeUnitLimit({ units: 169_090 })), ix(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }))],
      setupInstructions: [{ programId: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), accounts: [{ pubkey: wallet, isSigner: true, isWritable: true }], data: '' }],
      swapInstruction: {
        programId: this.swapProgram,
        accounts: [{ pubkey: wallet, isSigner: true, isWritable: true }, ...ALT_KEYS.map((k) => ({ pubkey: k.toBase58(), isSigner: false, isWritable: false }))],
        data: Buffer.from([1, 2, 3]).toString('base64'),
      },
      cleanupInstruction: null,
      otherInstructions: [],
      addressLookupTableAddresses: [ALT.key.toBase58()],
      computeUnitLimit: 169_090,
    };
  }
}

/** An unsigned transaction like Jupiter's limit-order ones: `payer` pays, then compute budget, a transfer and `program`. */
export function triggerTx(payer: string, program: string): string {
  const key = new PublicKey(payer);
  const msg = new TransactionMessage({
    payerKey: key,
    recentBlockhash: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      SystemProgram.transfer({ fromPubkey: key, toPubkey: new PublicKey(addr()), lamports: 1000 }),
      new TransactionInstruction({ programId: new PublicKey(program), keys: [{ pubkey: key, isSigner: true, isWritable: true }], data: Buffer.from([1]) }),
    ],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
}

export class FakeTrackerRpc implements TrackerRpc {
  txs = new Map<string, RawTx>();
  sigs = new Map<string, SignatureInfo[]>();
  holders = new Map<string, string[]>();
  async getTopHolders(mint: string) {
    return this.holders.get(mint) ?? [];
  }
  /** Files a transaction under another address too (a mint's market). */
  index(address: string, signature: string, blockTime: number) {
    const list = this.sigs.get(address) ?? [];
    list.push({ signature, slot: 0, err: null, blockTime });
    list.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
    this.sigs.set(address, list);
  }
  add(s: FakeSwap) {
    this.txs.set(s.signature, fakeSwapTx(s));
    const list = this.sigs.get(s.wallet) ?? [];
    list.push({ signature: s.signature, slot: 0, err: null, blockTime: s.blockTime });
    list.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
    this.sigs.set(s.wallet, list);
  }
  async getTransaction(signature: string) {
    return this.txs.get(signature) ?? null;
  }
  async getSignatures(address: string, o: { limit: number; until?: string; before?: string }) {
    let list = this.sigs.get(address) ?? [];
    if (o.before) list = list.slice(list.findIndex((s) => s.signature === o.before) + 1);
    if (o.until) {
      const i = list.findIndex((s) => s.signature === o.until);
      if (i >= 0) list = list.slice(0, i);
    }
    return list.slice(0, o.limit);
  }
}

/** The same chain, read the way Helius serves histories: whole transactions in bulk, 10 credits per 100. */
export class FakeHistoryRpc implements TrackerRpc {
  calls = { getTransaction: 0, getSignatures: 0, getHistory: 0 };
  constructor(private readonly base: FakeTrackerRpc) {}
  getTopHolders = (mint: string) => this.base.getTopHolders(mint);
  async getTransaction(signature: string) {
    this.calls.getTransaction++;
    return this.base.getTransaction(signature);
  }
  async getSignatures(address: string, o: { limit: number; until?: string; before?: string }) {
    this.calls.getSignatures++;
    return this.base.getSignatures(address, o);
  }
  async getHistory(address: string, o: HistoryOpts): Promise<History> {
    this.calls.getHistory++;
    let list = await this.base.getSignatures(address, { limit: 10_000, until: o.until, before: o.before?.signature });
    if (o.succeededOnly) list = list.filter((s) => !s.err);
    list = list.slice(0, o.limit);
    return { entries: list.map((s) => ({ ...s, tx: this.base.txs.get(s.signature) ?? null })), credits: 10 * Math.max(1, Math.ceil(list.length / 100)) };
  }
}

export const system = (lamports = 1e9): AccountInfo<Buffer> => ({ owner: SystemProgram.programId, data: Buffer.alloc(0), executable: false, lamports });

export class FakeChain {
  accounts = new Map<string, AccountInfo<Buffer>>();
  held = new Map<string, [string, number][]>();
  treasuryLamports = 5_000_000;
  down = false;
  async getSlot() {
    if (this.down) throw new Error('down');
    return 463_000_000;
  }
  async getAccountInfo(k: PublicKey) {
    if (this.down) throw new Error('down');
    return this.accounts.get(k.toBase58()) ?? null;
  }
  async getLatestBlockhash() {
    return { blockhash: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', lastValidBlockHeight: 441_000_000 };
  }
  async getAddressLookupTable(k: PublicKey) {
    return { context: { slot: 1 }, value: k.equals(ALT.key) ? ALT : null };
  }
  async getBalance(k: PublicKey) {
    return k.toBase58() === TREASURY ? this.treasuryLamports : 2e9;
  }
  async getMinimumBalanceForRentExemption() {
    return 890_880;
  }
  async getSignatureStatuses(sigs: string[]) {
    return { context: { slot: 1 }, value: sigs.map(() => ({ slot: 1, confirmations: null, err: null, confirmationStatus: 'confirmed' as const })) };
  }
  async sendRawTransaction() {
    return sig();
  }
  async getParsedTokenAccountsByOwner(owner: PublicKey, filter: { programId?: PublicKey; mint?: PublicKey }) {
    // Only the classic token program holds these test tokens.
    if (filter.programId && !filter.programId.equals(TOKEN_PROGRAM_ID)) return { context: { slot: 1 }, value: [] };
    const rows = (this.held.get(owner.toBase58()) ?? []).filter(([m]) => !filter.mint || filter.mint.toBase58() === m);
    return {
      context: { slot: 1 },
      value: rows.map(([mint, uiAmount]) => ({ pubkey: new PublicKey(addr()), account: { data: { parsed: { info: { mint, tokenAmount: { uiAmount } } } } } })),
    };
  }
}

