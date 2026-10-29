/**
 * USD prices for stock tokens and SOL/USDC. Stocks name their source in the
 * seed file: Pyth (price feed id, publish time) or Jupiter (by mint). Both
 * hosts come from config. Responses are parsed strictly; anything unexpected
 * counts as "no price" and shows up on /api/status.
 */
import { z } from 'zod';

export interface Price {
  usd: number;
  /** 24h change in percent when the source reports it. */
  change24h: number | null;
  /** Epoch ms of the source's last update. */
  updatedAt: number;
}

export interface PriceRequest {
  mint: string;
  source: 'jupiter' | 'pyth';
  feedId?: string | null;
}

export interface PriceSource {
  prices(req: PriceRequest[]): Promise<Map<string, Price>>;
}

const JupiterV3 = z.record(
  z.string(),
  z.object({ usdPrice: z.number().nonnegative(), priceChange24h: z.number().nullable().optional() }).passthrough().nullable(),
);

const HermesLatest = z.object({
  parsed: z.array(
    z.object({
      id: z.string(),
      price: z.object({ price: z.string(), expo: z.number(), publish_time: z.number() }),
    }),
  ),
});

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

export class LivePrices implements PriceSource {
  constructor(
    private readonly jupiterBase: string,
    private readonly hermesBase: string,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  async prices(req: PriceRequest[]): Promise<Map<string, Price>> {
    const out = new Map<string, Price>();
    const now = Date.now();
    const jup = req.filter((r) => r.source === 'jupiter').map((r) => r.mint);
    const pyth = req.filter((r) => r.source === 'pyth' && r.feedId);

    await Promise.all([
      (async () => {
        if (!jup.length) return;
        try {
          const data = JupiterV3.parse(await getJson(`${this.jupiterBase.replace(/\/$/, '')}/price/v3?ids=${jup.join(',')}`));
          for (const [mint, p] of Object.entries(data)) if (p) out.set(mint, { usd: p.usdPrice, change24h: p.priceChange24h ?? null, updatedAt: now });
        } catch (e) {
          this.log(`Jupiter prices unavailable: ${(e as Error).message}`);
        }
      })(),
      (async () => {
        if (!pyth.length) return;
        try {
          const qs = pyth.map((r) => `ids[]=${encodeURIComponent(r.feedId!)}`).join('&');
          const data = HermesLatest.parse(await getJson(`${this.hermesBase.replace(/\/$/, '')}/v2/updates/price/latest?${qs}`));
          const byFeed = new Map(data.parsed.map((p) => [p.id.replace(/^0x/, '').toLowerCase(), p.price]));
          for (const r of pyth) {
            const p = byFeed.get(r.feedId!.replace(/^0x/, '').toLowerCase());
            if (p) out.set(r.mint, { usd: Number(p.price) * 10 ** p.expo, change24h: null, updatedAt: p.publish_time * 1000 });
          }
        } catch (e) {
          this.log(`Pyth prices unavailable: ${(e as Error).message}`);
        }
      })(),
    ]);
    return out;
  }
}
