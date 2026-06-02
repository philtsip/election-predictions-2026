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
  for (const m of event.markets || []) {
    const g = (m.groupItemTitle || "").toLowerCase();
    if (g === "democrat" || g === "democratic party") return m;
  }
  return null;
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
  try {
    const url = `https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${seriesTicker}&status=open&limit=100`;
    const data = await fetchJson(url);
    return data.markets || [];
  } catch (e) {
    return [];
  }
}

function kalshiPickDem(markets: KalshiMarket[]): KalshiMarket | null {
  for (const m of markets) {
    const sub = (m.yes_sub_title || "").toLowerCase();
    if (sub.includes("democrat")) return m;
  }
  return null;
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
  const hasPrice = dem.outcomePrices && dem.outcomePrices !== "null";
  return polyRef(ev, dem, hasPrice ? "high" : "medium",
    hasPrice ? "Democrat sub-market with active prices" : "Democrat sub-market exists but no active prices");
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
    const hasPrice = dem.outcomePrices && dem.outcomePrices !== "null";
    return polyRef(ev, dem, hasPrice ? "high" : "medium",
      `slug=${slug}` + (hasPrice ? " (active prices)" : " (no prices yet)"));
  }
  return null;
}

async function findKalshiSenate(state: string): Promise<ProviderRef | null> {
  // Try party-level series first (cleaner D/R split), then candidate-level
  const candidates = [
    `SENATEPARTY-${state}`,
    `SENATEPARTY${state}`,
    `SENATE${state}`,
  ];
  for (const series of candidates) {
    const markets = await kalshiBySeries(series);
    const dem = kalshiPickDem(markets);
    if (dem) {
      const conf: "high" | "medium" = series.startsWith("SENATEPARTY") ? "high" : "medium";
      const note = series.startsWith("SENATEPARTY")
        ? `party-level series ${series}`
        : `candidate-level series ${series}; Democrat market matched by sub-title`;
      return kalshiRef(dem, series, conf, note);
    }
  }
  return null;
}

async function findKalshiHouse(state: string, district: number): Promise<ProviderRef | null> {
  const dd = String(district).padStart(2, "0");
  const candidates = [
    `HOUSEPARTY-${state}${dd}`,
    `HOUSEPARTY${state}${dd}`,
    `HOUSE${state}${dd}`,
    `HOUSE${state}${district}`,    // e.g. HOUSECA9 vs HOUSECA09
    `KXHOUSE${state}${dd}`,
  ];
  for (const series of candidates) {
    const markets = await kalshiBySeries(series);
    const dem = kalshiPickDem(markets);
    if (dem) {
      const conf: "high" | "medium" = series.includes("PARTY") ? "high" : "medium";
      const note = series.includes("PARTY")
        ? `party-level series ${series}`
        : `candidate-level series ${series}; Democrat market matched by sub-title`;
      return kalshiRef(dem, series, conf, note);
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
    // Be polite — both APIs are public but we don't want to spam them.
    await new Promise((r) => setTimeout(r, 150));
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
