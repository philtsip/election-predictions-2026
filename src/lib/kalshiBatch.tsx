import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectKalshiTickers, fetchKalshiBatch } from "./kalshi";
import type { MarketsFile } from "./types";

interface KalshiBatchValue {
  /** ticker → YES probability (0–1) */
  byTicker: Record<string, number>;
  isLoading: boolean;
}

const KalshiBatchContext = createContext<KalshiBatchValue>({
  byTicker: {},
  isLoading: false,
});

/**
 * Fetches every Kalshi market in one batched, polled request and shares the
 * result with all rows/cards via context — instead of one request per race
 * (which trips Kalshi's ~10 reads/s rate limit and 429s).
 */
export function KalshiBatchProvider({
  markets,
  children,
}: {
  markets: MarketsFile | undefined;
  children: ReactNode;
}) {
  const tickers = useMemo(
    () => (markets ? collectKalshiTickers(markets) : []),
    [markets]
  );

  const q = useQuery({
    queryKey: ["kalshi-batch", tickers.length],
    queryFn: () => fetchKalshiBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const value = useMemo<KalshiBatchValue>(
    () => ({ byTicker: q.data ?? {}, isLoading: q.isLoading && tickers.length > 0 }),
    [q.data, q.isLoading, tickers.length]
  );

  return (
    <KalshiBatchContext.Provider value={value}>
      {children}
    </KalshiBatchContext.Provider>
  );
}

export function useKalshiBatch() {
  return useContext(KalshiBatchContext);
}
