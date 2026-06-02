import type { MarketRef, OddsPoint } from "./types";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

/**
 * Fetch the current "Democrats win" probability from a Polymarket market.
 *
 * Strategy:
 * 1. If we have a clob_token_id, hit CLOB /price?token_id=...&side=buy → mid price.
 * 2. Otherwise fall back to the gamma market endpoint and read outcomePrices[demIndex].
 */
export async function fetchPolymarketDemProb(
  market: MarketRef
): Promise<OddsPoint> {
  const fetchedAt = Date.now();
  const sourceUrl = market.url;

  const tokenId = market.dem_outcome.clob_token_id;
  if (tokenId) {
    const r = await fetch(
      `${CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`
    );
    if (r.ok) {
      const j = (await r.json()) as { mid?: string | number };
      const mid = typeof j.mid === "string" ? parseFloat(j.mid) : j.mid;
      if (typeof mid === "number" && !Number.isNaN(mid)) {
        return { dem_prob: mid, fetched_at: fetchedAt, source_url: sourceUrl };
      }
    }
  }

  const idOrSlug =
    market.market_id ??
    (market.slug ? `?slug=${encodeURIComponent(market.slug)}` : null);
  if (!idOrSlug) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const url = market.market_id
    ? `${GAMMA_BASE}/markets/${market.market_id}`
    : `${GAMMA_BASE}/markets${idOrSlug}`;
  const r = await fetch(url);
  if (!r.ok) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const body = await r.json();
  const m = Array.isArray(body) ? body[0] : body;
  if (!m) return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };

  const outcomes = parseMaybeJson(m.outcomes) as string[] | undefined;
  const prices = parseMaybeJson(m.outcomePrices) as string[] | undefined;
  if (!outcomes || !prices) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const demIdx = outcomes.findIndex((o) => /democrat/i.test(o));
  if (demIdx < 0) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const p = parseFloat(prices[demIdx]);
  return {
    dem_prob: Number.isFinite(p) ? p : null,
    fetched_at: fetchedAt,
    source_url: sourceUrl,
  };
}

function parseMaybeJson(v: unknown) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}
