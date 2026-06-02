import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchPolymarketDemProb } from "./polymarket";
import { fetchKalshiDemProb } from "./kalshi";
import type { MarketRef, OddsPoint, Provider } from "./types";

export function useOdds(
  provider: Provider,
  market: MarketRef | null | undefined,
  key: string
): UseQueryResult<OddsPoint> {
  return useQuery({
    queryKey: ["odds", provider, key],
    queryFn: async () => {
      if (!market) {
        return {
          dem_prob: null,
          fetched_at: Date.now(),
          source_url: "",
        } satisfies OddsPoint;
      }
      return provider === "polymarket"
        ? fetchPolymarketDemProb(market)
        : fetchKalshiDemProb(market);
    },
    enabled: !!market,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
