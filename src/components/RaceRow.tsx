import type { MarketRef, Race } from "@/lib/types";
import { raceKey, raceLabel } from "@/lib/types";
import { usePolymarketOdds } from "@/lib/useOdds";
import { useKalshiBatch } from "@/lib/kalshiBatch";
import { kalshiDemProb } from "@/lib/kalshi";
import { ProbBar } from "./ProbBar";
import { CandidateSheet } from "./CandidateSheet";
import { cn } from "@/lib/cn";

interface Props {
  race: Race;
  poly: MarketRef | null;
  kalshi: MarketRef | null;
}

export function RaceRow({ race, poly, kalshi }: Props) {
  const key = raceKey(race);
  const polyOdds = usePolymarketOdds(poly, key);
  const { byTicker, isLoading: kalshiLoading } = useKalshiBatch();
  const kalshiProb = kalshiDemProb(kalshi, byTicker);

  const incumbent = race.candidates.find((c) => c.is_incumbent);

  return (
    <div className="group grid grid-cols-[auto_1fr_auto] sm:grid-cols-[10rem_1fr_auto] items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3 border-b border-border/40 last:border-b-0 hover:bg-card/40 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-base sm:text-lg font-bold tracking-tight tabular">
          {raceLabel(race)}
        </span>
        {race.chamber === "house" && race.pvi && (
          <span className="hidden sm:inline text-[10px] tabular text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
            {race.pvi}
          </span>
        )}
        {incumbent && (
          <span
            title={`Incumbent: ${incumbent.first_name} ${incumbent.last_name} (${incumbent.party})`}
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5",
              incumbent.party === "D"
                ? "bg-dem-soft text-dem"
                : incumbent.party === "R"
                  ? "bg-rep-soft text-rep"
                  : "bg-muted/50 text-muted-foreground"
            )}
          >
            i
          </span>
        )}
        <CandidateSheet race={race} />
      </div>

      <div className="min-w-0">
        <ProbBar poly={polyOdds.data?.dem_prob} kalshi={kalshiProb} />
      </div>

      <div className="flex items-center gap-3 sm:gap-5 tabular text-right">
        <OddsCell
          label="P"
          value={polyOdds.data?.dem_prob}
          loading={polyOdds.isLoading}
          color="text-foreground"
          markerColor="bg-[hsl(215_90%_60%)]"
        />
        <OddsCell
          label="K"
          value={kalshiProb}
          loading={kalshiLoading}
          color="text-foreground"
          markerColor="bg-[hsl(150_65%_47%)]"
        />
      </div>
    </div>
  );
}

function OddsCell({
  label,
  value,
  loading,
  color,
  markerColor,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  color: string;
  markerColor: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          markerColor,
          loading && "animate-pulse"
        )}
      />
      <span
        className={cn(
          "text-sm sm:text-base font-semibold tabular w-10 text-right",
          color
        )}
      >
        {value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${Math.round(value * 100)}%`
        )}
        <span className="sr-only">{label}</span>
      </span>
    </div>
  );
}
