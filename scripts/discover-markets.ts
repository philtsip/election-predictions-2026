/**
 * Discover Polymarket + Kalshi market IDs for every race in races.raw.json
 * plus the four chamber-control markets.
 *
 * For each provider we record enough to fetch live prices later:
 *   - provider, market_id / ticker / slug
 *   - market_url (human-clickable)
 *   - dem_outcome: how to read "Democrat wins" probability.
 *       Polymarket: { type: "clob_token_yes", clob_token_id, market_slug, market_id }
 *         => fetch the "Yes" token price on the Democrat sub-market.
 *       Kalshi:     { type: "market_yes", ticker }
 *         => fetch the Democrat market's YES price.
 *   - confidence: high | medium | low + note
 *
 * Polymarket lookup strategy
 *   - Senate state race: event slug `{state-name}-senate-election-winner`
 *   - House district race: event slug `which-party-will-win-the-house-race-for-the-{xx}-{dd}-seat`
 *   - Chamber control: events `which-party-will-win-the-senate-in-2026` and
 *     `which-party-will-win-the-house-in-2026`
 *   - Inside an event, pick the sub-market with `groupItemTitle` "Democrat" or
 *     "Democratic Party" — take its first clobTokenId (the "Yes" side).
 *
 * Kalshi lookup strategy
 *   - Chamber control: series CONTROLS / CONTROLH, market tickers
 *       CONTROLS-2026-D and CONTROLH-2026-D (YES = "Democrats win").
 *   - Senate race: try series tickers in order:
 *       SENATEPARTY-{XX}, SENATEPARTY{XX}, SENATE{XX}, KX{XX}SENATE
 *       Pick the market whose yes_sub_title contains "Democrat".
 *   - House race: try HOUSEPARTY-{XX}{NN}, HOUSE{XX}{N}, HOUSE{XX}{NN}.
 *       Same matching rule.
 *
 * Usage:
 *   bun run discover               # or: bun scripts/discover-markets.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const RACES_FILE = path.join(ROOT, "public/data/races.raw.json");
const OUT_FILE = path.join(ROOT, "public/data/markets.raw.json");

interface RaceRecord {
  chamber: "senate" | "house";
  state: string;
  district: number | null;
  cook_rating: string;
  pvi: string | null;
  cook_url: string;
  candidates: any[];
}

const STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire",
  NJ: "new-jersey", NM: "new-mexico", NY: "new-york", NC: "north-carolina",
  ND: "north-dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania",
  RI: "rhode-island", SC: "south-carolina", SD: "south-dakota", TN: "tennessee",
  TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
};

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// -------------------- Polymarket --------------------

interface PolyEvent {
  id: string; slug: string; title: string;
  markets: PolyMarket[];
}
interface PolyMarket {
  id: string; conditionId: string; slug: string; question: string;
  outcomes: string;        // JSON-encoded string
  outcomePrices?: string;
  clobTokenIds: string;    // JSON-encoded string
  groupItemTitle?: string;
}

async function polyGetEvent(slug: string): Promise<PolyEvent | null> {
  try {
    const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`;
    const data = await fetchJson(url);
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch (e) {
    console.error(`  poly fail ${slug}: ${(e as Error).message}`);
    return null;
  }
}

function polyPickDem(event: PolyEvent): PolyMarket | null {
  // First preference: a party-level sub-market ("Democrat" / "Democratic Party").
  for (const m of event.markets || []) {
    const g = (m.groupItemTitle || "").toLowerCase();
    if (g === "democrat" || g === "democratic party" || g === "democrats") return m;
  }
  // Some events only list individual candidates with party suffix, e.g.
  // "Sherrod Brown (D)". Pick the candidate with active prices, preferring the
  // one whose question contains "Democrat" or whose title ends in "(D)".
  const dCandidates = (event.markets || []).filter((m) => {
    const g = (m.groupItemTitle || "").toLowerCase();
    return g.endsWith("(d)") || /\bdemocrat/i.test(g);
  });
  if (dCandidates.length === 0) return null;
  // Pick the one with the highest YES price (most likely the Democratic nominee).
  const withPrice = dCandidates.filter((m) => m.outcomePrices && m.outcomePrices !== "null");
  if (withPrice.length === 0) return dCandidates[0];
  return withPrice.sort((a, b) => {
    const pa = parseFloat(JSON.parse(a.outcomePrices!)[0]);
    const pb = parseFloat(JSON.parse(b.outcomePrices!)[0]);
    return pb - pa;
  })[0];
}

interface ProviderRef {
  provider: "polymarket" | "kalshi";
  market_url: string;
  confidence: "high" | "medium" | "low";
  note: string;
  // polymarket
  event_slug?: string;
  market_slug?: string;
  market_id?: string;
  condition_id?: string;
  clob_token_yes?: string;
  // kalshi
  series_ticker?: string;
  event_ticker?: string;
  ticker?: string;
  dem_outcome: any;
}

function polyRef(
  event: PolyEvent,
  market: PolyMarket,
  conf: "high" | "medium" | "low",
  note: string,
): ProviderRef {
  let tokens: string[] = [];
  try { tokens = JSON.parse(market.clobTokenIds || "[]"); } catch {}
  const yesToken = tokens[0] || null;
  return {
    provider: "polymarket",
    market_url: `https://polymarket.com/event/${event.slug}`,
    event_slug: event.slug,
    market_slug: market.slug,
    market_id: market.id,
    condition_id: market.conditionId,
    clob_token_yes: yesToken || undefined,
    confidence: conf,
    note,
    dem_outcome: {
      type: "clob_token_yes",
      clob_token_id: yesToken,
      market_slug: market.slug,
      market_id: market.id,
    },
  };
}

// -------------------- Kalshi --------------------

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string;
  last_price_dollars?: string;
}

async function kalshiBySeries(seriesTicker: string): Promise<KalshiMarket[]> {
  // Kalshi returns 429 quickly under sustained load. Built-in tiny delay +
  // one retry with backoff.
  const delays = [0, 1000, 4000];
  let lastErr: Error | null = null;
  for (const d of delays) {
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    try {
      const url = `https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${seriesTicker}&status=open&limit=100`;
      const data = await fetchJson(url);
      return data.markets || [];
    } catch (e) {
      lastErr = e as Error;
      if (!String(lastErr.message).includes("429")) break;
    }
  }
  if (lastErr) console.error(`  kalshi ${seriesTicker}: ${lastErr.message}`);
  return [];
}

function kalshiPickDem(markets: KalshiMarket[]): KalshiMarket | null {
  // Kalshi often has both 2026 and 2028 cycles under the same series. Prefer
  // 2026 — match either the event_ticker ending in -26 or the market ticker
  // containing -26-.
  const matches = markets.filter((m) => {
    const sub = (m.yes_sub_title || "").toLowerCase();
    return sub.includes("democrat");
  });
  if (matches.length === 0) {
    // Fall back to ticker-suffix matching: party-control markets sometimes use
    // candidate sub-titles (e.g. "Roy Cooper") but the ticker still ends in
    // -D or -DEM.
    const dByTicker = markets.filter((m) => /-26-(D|DEM)$/.test(m.ticker));
    if (dByTicker.length > 0) return dByTicker[0];
    return null;
  }
  const yr26 = matches.find(
    (m) => /-26$/.test(m.event_ticker) || /-26-/.test(m.ticker),
  );
  return yr26 || matches[0];
}

function kalshiPickDemTickerOnly(markets: KalshiMarket[]): KalshiMarket | null {
  // For 2026 races, fall back to picking the ticker suffix. Patterns seen:
  //   -26-D, -26-DEM  (party suffix on a -26 event)
  return markets.find(
    (m) => /-26-(D|DEM)$/.test(m.ticker),
  ) || null;
}

function kalshiRef(
  m: KalshiMarket,
  seriesTicker: string,
  conf: "high" | "medium" | "low",
  note: string,
): ProviderRef {
  return {
    provider: "kalshi",
    series_ticker: seriesTicker,
    event_ticker: m.event_ticker,
    ticker: m.ticker,
    market_url: `https://kalshi.com/markets/${seriesTicker.toLowerCase()}/${m.event_ticker.toLowerCase()}`,
    confidence: conf,
    note,
    dem_outcome: {
      type: "market_yes",
      ticker: m.ticker,
    },
  };
}

// -------------------- Per-race lookup --------------------

async function findPolymarketSenate(state: string): Promise<ProviderRef | null> {
  const stateName = STATE_ABBR_TO_NAME[state];
  if (!stateName) return null;
  const slug = `${stateName}-senate-election-winner`;
  const ev = await polyGetEvent(slug);
  if (!ev) return null;
  const dem = polyPickDem(ev);
  if (!dem) return null;
  const g = (dem.groupItemTitle || "").toLowerCase();
  const isParty = g === "democrat" || g === "democratic party" || g === "democrats";
  const hasPrice = dem.outcomePrices && dem.outcomePrices !== "null";
  let conf: "high" | "medium" | "low" = "low";
  let note = "";
  if (isParty && hasPrice) { conf = "high"; note = "party-level Democrat sub-market with active prices"; }
  else if (isParty) { conf = "medium"; note = "party-level Democrat sub-market but no active prices yet"; }
  else if (hasPrice) { conf = "medium"; note = `no party sub-market; using candidate "${dem.groupItemTitle}" (highest-price D)`; }
  else { conf = "low"; note = `only candidate sub-market "${dem.groupItemTitle}" matched, and no prices`; }
  return polyRef(ev, dem, conf, note);
}

async function findPolymarketHouse(state: string, district: number): Promise<ProviderRef | null> {
  const dd = String(district).padStart(2, "0");
  const xx = state.toLowerCase();
  // Try the documented pattern first, then a few alternates
  const slugs = [
    `which-party-will-win-the-house-race-for-the-${xx}-${dd}-seat`,
    `which-party-will-win-the-house-race-for-the-${xx}-${district}-seat`,
    `${xx}-${dd}-house-election-winner`,
    `${xx}-${district}-house-election-winner`,
  ];
  for (const slug of slugs) {
    const ev = await polyGetEvent(slug);
    if (!ev) continue;
    const dem = polyPickDem(ev);
    if (!dem) continue;
    const g = (dem.groupItemTitle || "").toLowerCase();
    const isParty = g === "democrat" || g === "democratic party" || g === "democrats";
    const hasPrice = dem.outcomePrices && dem.outcomePrices !== "null";
    let conf: "high" | "medium" | "low" = "low";
    let note = "";
    if (isParty && hasPrice) { conf = "high"; note = `slug=${slug}, party-level Democrat market with prices`; }
    else if (isParty) { conf = "medium"; note = `slug=${slug}, party-level Democrat market, no prices yet`; }
    else if (hasPrice) { conf = "medium"; note = `slug=${slug}, no party sub-market; using candidate "${dem.groupItemTitle}"`; }
    else { conf = "low"; note = `slug=${slug}, candidate-level "${dem.groupItemTitle}", no prices`; }
    return polyRef(ev, dem, conf, note);
  }
  return null;
}

async function findKalshiSenate(state: string): Promise<ProviderRef | null> {
  const candidates = [
    `SENATEPARTY-${state}`,
    `SENATEPARTY${state}`,
    `SENATE${state}`,
  ];
  for (const series of candidates) {
    const markets = await kalshiBySeries(series);
    const dem = kalshiPickDem(markets);
    if (dem) {
      const sub = (dem.yes_sub_title || "").toLowerCase();
      const isParty = sub.includes("party");
      return kalshiRef(
        dem, series,
        isParty ? "high" : "medium",
        isParty
          ? `party-level market in series ${series}`
          : `candidate-level market in series ${series} (yes_sub_title="${dem.yes_sub_title}"); verify candidate is Democratic nominee`,
      );
    }
    // Some 2026 markets only label by candidate name. Fall back to ticker -D.
    const dByTic = kalshiPickDemTickerOnly(markets);
    if (dByTic) {
      return kalshiRef(
        dByTic, series, "medium",
        `candidate-level market in series ${series}, picked by ticker -D suffix (sub-title was "${dByTic.yes_sub_title}")`,
      );
    }
  }
  return null;
}

async function findKalshiHouse(state: string, district: number): Promise<ProviderRef | null> {
  const dd = String(district).padStart(2, "0");
  const candidates = [
    `HOUSEPARTY-${state}${dd}`,
    `HOUSEPARTY${state}${dd}`,
    `HOUSEPARTY-${state}${district}`,
    `HOUSE${state}${dd}`,
    `HOUSE${state}${district}`,
    `KXHOUSE${state}${dd}`,
    `KXHOUSE${state}${district}`,
    `HOUSE${state}${district}S`,    // special elections e.g. HOUSEAZ7S, HOUSETN7S
  ];
  for (const series of candidates) {
    const markets = await kalshiBySeries(series);
    const dem = kalshiPickDem(markets);
    if (dem) {
      const sub = (dem.yes_sub_title || "").toLowerCase();
      const isParty = sub.includes("party") || series.includes("PARTY");
      return kalshiRef(
        dem, series,
        isParty ? "high" : "medium",
        isParty
          ? `party-level market in series ${series}`
          : `candidate-level market in series ${series} (yes_sub_title="${dem.yes_sub_title}")`,
      );
    }
    const dByTic = kalshiPickDemTickerOnly(markets);
    if (dByTic) {
      return kalshiRef(
        dByTic, series, "medium",
        `candidate-level market in series ${series}, picked by ticker -D suffix (sub-title was "${dByTic.yes_sub_title}")`,
      );
    }
  }
  return null;
}

// -------------------- Main --------------------

async function main() {
  const races: RaceRecord[] = JSON.parse(fs.readFileSync(RACES_FILE, "utf8"));
  console.log(`Loaded ${races.length} races`);

  // ===== Chamber control =====
  console.log("\n== Chamber control ==");
  const sEvent = await polyGetEvent("which-party-will-win-the-senate-in-2026");
  const hEvent = await polyGetEvent("which-party-will-win-the-house-in-2026");

  const sPoly = sEvent ? polyPickDem(sEvent) : null;
  const hPoly = hEvent ? polyPickDem(hEvent) : null;

  const senatePolymarket: ProviderRef | null = sEvent && sPoly
    ? polyRef(sEvent, sPoly, "high", "Canonical Polymarket senate-control event")
    : null;
  const housePolymarket: ProviderRef | null = hEvent && hPoly
    ? polyRef(hEvent, hPoly, "high", "Canonical Polymarket house-control event")
    : null;

  // Kalshi chamber control
  const senateKalshiMarkets = await kalshiBySeries("CONTROLS");
  const senateKalshiDem = senateKalshiMarkets.find(
    (m) => m.ticker === "CONTROLS-2026-D",
  ) || kalshiPickDem(senateKalshiMarkets.filter(m => m.event_ticker === "CONTROLS-2026"));
  const houseKalshiMarkets = await kalshiBySeries("CONTROLH");
  const houseKalshiDem = houseKalshiMarkets.find(
    (m) => m.ticker === "CONTROLH-2026-D",
  ) || kalshiPickDem(houseKalshiMarkets.filter(m => m.event_ticker === "CONTROLH-2026"));

  const senateKalshi: ProviderRef | null = senateKalshiDem
    ? kalshiRef(senateKalshiDem, "CONTROLS", "high",
        "Canonical Kalshi senate-control market (CONTROLS-2026-D)")
    : null;
  const houseKalshi: ProviderRef | null = houseKalshiDem
    ? kalshiRef(houseKalshiDem, "CONTROLH", "high",
        "Canonical Kalshi house-control market (CONTROLH-2026-D)")
    : null;

  const out: any = {
    chamber_control: {
      senate: { polymarket: senatePolymarket, kalshi: senateKalshi },
      house:  { polymarket: housePolymarket, kalshi: houseKalshi },
    },
    races: {} as Record<string, { polymarket: ProviderRef | null; kalshi: ProviderRef | null }>,
  };

  console.log("Senate ctrl: poly=" + (senatePolymarket ? "OK" : "MISS") +
              " kalshi=" + (senateKalshi ? "OK" : "MISS"));
  console.log("House  ctrl: poly=" + (housePolymarket ? "OK" : "MISS") +
              " kalshi=" + (houseKalshi ? "OK" : "MISS"));

  // ===== Per-race =====
  console.log("\n== Per-race lookups ==");
  let i = 0;
  for (const r of races) {
    i++;
    const key = r.chamber === "senate"
      ? `senate-${r.state}`
      : `house-${r.state}-${String(r.district).padStart(2, "0")}`;

    let poly: ProviderRef | null = null;
    let kalshi: ProviderRef | null = null;
    if (r.chamber === "senate") {
      poly = await findPolymarketSenate(r.state);
      kalshi = await findKalshiSenate(r.state);
    } else if (r.district != null) {
      poly = await findPolymarketHouse(r.state, r.district);
      kalshi = await findKalshiHouse(r.state, r.district);
    }
    out.races[key] = { polymarket: poly, kalshi };
    console.log(
      `  [${i}/${races.length}] ${key} poly=${poly ? poly.confidence : "MISS"} ` +
      `kalshi=${kalshi ? kalshi.confidence : "MISS"}`,
    );
    // Be polite — Kalshi rate-limits aggressively.
    await new Promise((r) => setTimeout(r, 400));
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);

  const hi = countConf(out, "high");
  const md = countConf(out, "medium");
  const lo = countConf(out, "low");
  const miss = countMiss(out);
  console.log(`Confidence: high=${hi} medium=${md} low=${lo} miss=${miss}`);
}

function countConf(o: any, c: string): number {
  let n = 0;
  const visit = (v: any) => {
    if (v && typeof v === "object") {
      if (v.confidence === c) n++;
      for (const k of Object.keys(v)) visit(v[k]);
    }
  };
  visit(o);
  return n;
}
function countMiss(o: any): number {
  let n = 0;
  for (const v of Object.values(o.chamber_control)) {
    const cc = v as any;
    if (!cc.polymarket) n++;
    if (!cc.kalshi) n++;
  }
  for (const v of Object.values(o.races)) {
    const rr = v as any;
    if (!rr.polymarket) n++;
    if (!rr.kalshi) n++;
  }
  return n;
}

main().catch((e) => { console.error(e); process.exit(1); });
