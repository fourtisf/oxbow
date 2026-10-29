/**
 * Which data the app reads. Set NEXT_PUBLIC_LIVE_DATA=1 at build time to read
 * the Oxbow API (real pools, prices and tokens); otherwise the app runs on
 * the mock layer with the prototype's sample data, where every pool, price,
 * address and wallet is made up and outbound explorer links would find nothing.
 */
export const LIVE_DATA = ['1', 'true'].includes((process.env.NEXT_PUBLIC_LIVE_DATA ?? '').trim().toLowerCase());
export const SAMPLE_DATA = !LIVE_DATA;
