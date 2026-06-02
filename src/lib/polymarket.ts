import type { MarketRef, OddsPoint } from "./types";

// Production fetches Polymarket directly from the browser (its APIs send
// `access-control-allow-origin: *`). In dev we route through the Vite proxy so
// local/sandboxed environments with TLS-intercepting proxies still work.
const DEV = import.meta.env.DEV;
const GAMMA_BASE = DEV ? "/pm-gamma" : "https://gamma-api.polymarket.com";
const CLOB_BASE = DEV ? "/pm-clob" : "https://clob.polymarket.com";

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
  const sourceUrl = market.market_url ?? "";

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

  const slug = market.dem_outcome.market_slug ?? market.market_slug;
  const marketId = market.dem_outcome.market_id ?? market.market_id;
  if (!marketId && !slug) {
    return { dem_prob: null, fetched_at: fetchedAt, source_url: sourceUrl };
  }
  const url = marketId
    ? `${GAMMA_BASE}/markets/${marketId}`
    : `${GAMMA_BASE}/markets?slug=${encodeURIComponent(slug!)}`;
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
