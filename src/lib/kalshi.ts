import type { MarketRef, OddsPoint } from "./types";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

/**
 * Fetch the current "Democrats win" probability from a Kalshi market.
 *
 * Kalshi prices are in cents (0–100). We pull the market by ticker and use
 * `yes_bid`/`yes_ask` midpoint (or `last_price` fallback).
 *
 * Direction: if dem_outcome.side === "yes" the YES price = Dem prob;
 * if "no", we invert.
 */
export async function fetchKalshiDemProb(market: MarketRef): Promise<OddsPoint> {
  const fetchedAt = Date.now();
  const sourceUrl = market.url;
  const ticker = market.dem_outcome.kalshi_ticker ?? market.ticker;
  if (!ticker) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }

  const r = await fetch(
    `${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`
  );
  if (!r.ok) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const body = (await r.json()) as { market?: KalshiMarket };
  const m = body.market;
  if (!m) return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };

  const yesBid = m.yes_bid;
  const yesAsk = m.yes_ask;
  const last = m.last_price;
  const mid =
    yesBid != null && yesAsk != null
      ? (yesBid + yesAsk) / 2
      : last != null
        ? last
        : null;
  if (mid == null) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const yesProb = mid / 100;
  const demProb =
    market.dem_outcome.side === "no" ? 1 - yesProb : yesProb;
  return { dem_prob: demProb, fetched_at: fetchedAt, source_url: sourceUrl };
}

interface KalshiMarket {
  ticker: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number;
}
