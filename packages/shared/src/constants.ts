export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Wrapped SOL: Jupiter and the API name SOL by this mint. */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

/** Quick amounts on the buy panel, in SOL. */
export const BUY_CHIPS_SOL = [0.1, 0.25, 0.5, 1] as const;

/** Quick shares of the balance on the sell panel, percent. */
export const SELL_CHIPS_PCT = [25, 50, 100] as const;

/** Slippage choices on the trade panel, basis points. */
export const SLIPPAGE_BPS = [50, 100, 300, 1000] as const;
