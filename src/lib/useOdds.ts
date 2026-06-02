import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchPolymarketDemProb } from "./polymarket";
import type { MarketRef, OddsPoint } from "./types";

/**
 * Per-market Polymarket odds. Polymarket is fetched directly from the browser
 * (CORS-enabled) and handles the burst fine. Kalshi is rate-limited, so it goes
 * through a single batched request instead — see kalshiBatch.tsx.
 */
export function usePolymarketOdds(
  market: MarketRef | null | undefined,
  key: string
): UseQueryResult<OddsPoint> {
  return useQuery({
    queryKey: ["odds", "polymarket", key],
    queryFn: async () => {
      if (!market) {
        return {
          dem_prob: null,
          fetched_at: Date.now(),
          source_url: "",
        } satisfies OddsPoint;
      }
      return fetchPolymarketDemProb(market);
    },
    enabled: !!market,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
