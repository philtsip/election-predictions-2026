import type { MarketRef, OddsPoint } from "./types";

// Same-origin proxy (Vercel Edge function / Vite dev proxy) — Kalshi sends no
// CORS header, so the browser can't call it directly. See api/kalshi/[...path].ts.
const KALSHI_BASE = "/api/kalshi";

/**
 * Fetch the current "Democrats win" probability from a Kalshi market.
 *
 * Kalshi's elections API returns prices in dollars (0–1) as strings:
 * `yes_bid_dollars` / `yes_ask_dollars` (midpoint), falling back to
 * `last_price_dollars`. The market ticker (e.g. SENATEMI-26-D) is the
 * Democrat-party market, so YES = "Democrat wins".
 *
 * Direction: default treats YES as Dem-win; if dem_outcome.side === "no" we
 * invert.
 */
export async function fetchKalshiDemProb(market: MarketRef): Promise<OddsPoint> {
  const fetchedAt = Date.now();
  const sourceUrl = market.market_url ?? "";
  const ticker = market.dem_outcome.ticker ?? market.ticker;
  if (!ticker) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }

  const r = await fetch(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
  if (!r.ok) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const body = (await r.json()) as { market?: KalshiMarket };
  const m = body.market;
  if (!m) return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };

  const bid = num(m.yes_bid_dollars);
  const ask = num(m.yes_ask_dollars);
  const last = num(m.last_price_dollars);
  const yesProb =
    bid != null && ask != null ? (bid + ask) / 2 : last != null ? last : null;
  if (yesProb == null) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const demProb = market.dem_outcome.side === "no" ? 1 - yesProb : yesProb;
  return { dem_prob: demProb, fetched_at: fetchedAt, source_url: sourceUrl };
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

interface KalshiMarket {
  ticker: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
}
