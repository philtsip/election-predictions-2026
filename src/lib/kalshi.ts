import type { MarketRef } from "./types";

// Same-origin proxy — Kalshi sends no CORS header, so the browser can't call it
// directly. In prod a Vercel rewrite forwards /api/kalshi/* to Kalshi
// server-side (see vercel.json); in dev the Vite proxy does the same.
const KALSHI_BASE = "/api/kalshi";

// Kalshi rate-limits reads (token bucket, ~10 reads/s on the default tier), so
// we fetch every market in one batched call rather than one request per race.
const BATCH_SIZE = 80;

interface KalshiMarket {
  ticker: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
}

/** Mid of yes bid/ask in dollars (0–1), falling back to last price. */
function yesProb(m: KalshiMarket): number | null {
  const bid = num(m.yes_bid_dollars);
  const ask = num(m.yes_ask_dollars);
  const last = num(m.last_price_dollars);
  if (bid != null && ask != null) return (bid + ask) / 2;
  return last;
}

function num(v: string | undefined | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch many Kalshi markets at once via `GET /markets?tickers=...`.
 * Returns a map of ticker → YES probability (0–1). Chunked to stay well within
 * the URL length / rate limits; 64 markets currently fit in a single request.
 */
export async function fetchKalshiBatch(
  tickers: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const uniq = [...new Set(tickers)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += BATCH_SIZE) {
    const chunk = uniq.slice(i, i + BATCH_SIZE);
    const r = await fetch(
      `${KALSHI_BASE}/markets?tickers=${encodeURIComponent(chunk.join(","))}&limit=200`
    );
    if (!r.ok) continue;
    const j = (await r.json()) as { markets?: KalshiMarket[] };
    for (const m of j.markets ?? []) {
      const yp = yesProb(m);
      if (yp != null) out[m.ticker] = yp;
    }
  }
  return out;
}

/**
 * Resolve a race/chamber market's P(Democrat wins) from the batched YES-prob
 * map. The `-D` ticker's YES = Dem win; `dem_outcome.side === "no"` inverts.
 */
export function kalshiDemProb(
  market: MarketRef | null | undefined,
  byTicker: Record<string, number> | undefined
): number | null {
  if (!market || !byTicker) return null;
  const ticker = market.dem_outcome.ticker ?? market.ticker;
  if (!ticker) return null;
  const yp = byTicker[ticker];
  if (yp == null) return null;
  return market.dem_outcome.side === "no" ? 1 - yp : yp;
}

/** Collect every Kalshi ticker referenced by the markets file (deduped). */
export function collectKalshiTickers(markets: {
  chamber_control: Record<string, { kalshi: MarketRef | null }>;
  races: Record<string, { kalshi: MarketRef | null }>;
}): string[] {
  const out: string[] = [];
  const push = (m: MarketRef | null) => {
    const t = m?.dem_outcome?.ticker ?? m?.ticker;
    if (t) out.push(t);
  };
  for (const cc of Object.values(markets.chamber_control)) push(cc.kalshi);
  for (const r of Object.values(markets.races)) push(r.kalshi);
  return [...new Set(out)];
}
