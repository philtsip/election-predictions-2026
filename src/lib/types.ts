export type Chamber = "senate" | "house";
export type Party = "D" | "R" | "I";
export type CookRating =
  | "tossup"
  | "lean_d"
  | "lean_r"
  | "likely_d"
  | "likely_r";

export interface Candidate {
  first_name: string;
  last_name: string;
  party: Party;
  is_incumbent: boolean;
  bio: string | null;
}

export interface Race {
  chamber: Chamber;
  state: string;
  district: number | null;
  cook_rating: CookRating;
  pvi: string | null;
  cook_url: string | null;
  candidates: Candidate[];
}

/**
 * Shape produced by scripts/discover-markets.ts. The dashboard reads:
 *  - dem_outcome.clob_token_id (Polymarket) / dem_outcome.ticker (Kalshi)
 *    to fetch the live "Democrat wins" price
 *  - market_url for the clickable link
 */
export interface MarketRef {
  provider?: Provider;
  market_id?: string;
  market_slug?: string;
  event_slug?: string;
  ticker?: string;
  market_url?: string;
  dem_outcome: {
    type?: string;
    /** Polymarket: clobTokenId for the "Democrat wins" outcome */
    clob_token_id?: string;
    market_slug?: string;
    market_id?: string;
    /** Kalshi: the ticker that resolves YES to a Dem win */
    ticker?: string;
    /** If "no", we invert the YES price; default treats YES as Dem-win. */
    side?: "yes" | "no";
  };
  confidence?: "high" | "medium" | "low";
  note?: string | null;
}

export interface ChamberControlMarkets {
  polymarket: MarketRef | null;
  kalshi: MarketRef | null;
}

export interface RaceMarkets {
  polymarket: MarketRef | null;
  kalshi: MarketRef | null;
}

export interface MarketsFile {
  chamber_control: {
    senate: ChamberControlMarkets;
    house: ChamberControlMarkets;
  };
  races: Record<string, RaceMarkets>;
}

export type Provider = "polymarket" | "kalshi";

export interface OddsPoint {
  /** Probability that Democrats win, [0, 1] */
  dem_prob: number | null;
  fetched_at: number;
  source_url: string;
}

export function raceKey(race: Pick<Race, "chamber" | "state" | "district">) {
  if (race.chamber === "senate") return `senate-${race.state}`;
  const d = String(race.district ?? 0).padStart(2, "0");
  return `house-${race.state}-${d}`;
}

export function raceLabel(race: Race) {
  if (race.chamber === "senate") return race.state;
  return `${race.state}-${race.district}`;
}
