import { useQuery } from "@tanstack/react-query";
import type { MarketsFile, Race } from "./types";

/** Try clean file first, fall back to .raw — useful before refresh.ts has run. */
async function loadJson<T>(name: string): Promise<T> {
  const r = await fetch(`/data/${name}.json`);
  if (r.ok) return r.json();
  const raw = await fetch(`/data/${name}.raw.json`);
  if (raw.ok) return raw.json();
  throw new Error(`Missing /data/${name}.json (and .raw.json)`);
}

export function useRaces() {
  return useQuery({
    queryKey: ["races"],
    queryFn: () => loadJson<Race[]>("races"),
    staleTime: Infinity,
    refetchInterval: false,
  });
}

const EMPTY_MARKETS: MarketsFile = {
  chamber_control: {
    senate: { polymarket: null, kalshi: null },
    house: { polymarket: null, kalshi: null },
  },
  races: {},
};

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<MarketsFile> => {
      try {
        return await loadJson<MarketsFile>("markets");
      } catch {
        return EMPTY_MARKETS;
      }
    },
    staleTime: Infinity,
    refetchInterval: false,
  });
}
