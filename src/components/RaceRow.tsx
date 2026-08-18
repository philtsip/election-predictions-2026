import type { Chamber, MarketRef, Race } from "@/lib/types";
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

/**
 * Shared between the rows and the column header so the "Poly" / "Kalshi"
 * captions sit exactly above their numbers. The label column is a fixed width
 * (not `auto`) so every progress bar starts at the same x, whatever the row's
 * state code / incumbent badge happen to be.
 *
 * Phone widths are the tight case — the bar gets whatever is left over, so the
 * label column, the gutters and the odds columns are all trimmed to the width
 * their content actually needs and only open up from `sm` on.
 */
const ROW_GRID = "grid items-center gap-1.5 sm:gap-5 px-2.5 sm:px-5";

/**
 * The label column is only as wide as its chamber's widest possible label, so
 * the bar starts as early as it can. Every label in a chamber is the same
 * width by construction — a two-letter state code, plus a fixed two-character
 * district slot and a fixed-width PVI chip for the House — so these are exact
 * (measured content + a few px of slack for a fallback font).
 */
const LABEL_COL: Record<Chamber, string> = {
  house: "grid-cols-[5.5rem_1fr_auto] sm:grid-cols-[9.75rem_1fr_auto]",
  senate: "grid-cols-[3.75rem_1fr_auto] sm:grid-cols-[4.5rem_1fr_auto]",
  governor: "grid-cols-[3.75rem_1fr_auto] sm:grid-cols-[4.5rem_1fr_auto]",
};

const ODDS_GROUP = "flex items-center gap-2 sm:gap-5";
const ODDS_COL = "w-10 sm:w-12 text-right tabular";

const POLY_COLOR = "text-[hsl(215_90%_66%)]";
const KALSHI_COLOR = "text-[hsl(150_65%_52%)]";

export function RaceRow({ race, poly, kalshi }: Props) {
  const key = raceKey(race);
  const polyOdds = usePolymarketOdds(poly, key);
  const { byTicker, isLoading: kalshiLoading } = useKalshiBatch();
  const kalshiProb = kalshiDemProb(kalshi, byTicker);

  const incumbent = race.candidates.find((c) => c.is_incumbent);

  return (
    <div
      className={cn(
        ROW_GRID,
        LABEL_COL[race.chamber],
        "group py-3 border-b border-border/40 last:border-b-0 hover:bg-card/40 transition-colors"
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className="font-mono text-base sm:text-lg font-bold tracking-tight tabular whitespace-nowrap">
          {race.chamber === "house" && race.district != null ? (
            <>
              {race.state}-
              {/* Two-character slot: a single-digit district would otherwise
                  pull everything after it a character to the left. */}
              <span className="inline-block w-[2ch] text-left">
                {race.district}
              </span>
            </>
          ) : (
            raceLabel(race)
          )}
        </span>
        {race.chamber === "house" && race.pvi && (
          // Fixed width so "R+10" and "D+2" leave the info button in the
          // same place.
          <span className="hidden sm:inline-flex justify-center w-11 text-[10px] tabular text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
            {race.pvi}
          </span>
        )}
        {/* Fixed-width slot: races with no incumbent keep the gap so the
            info marker and the bar stay aligned across rows. */}
        <span className="w-3.5 sm:w-4 shrink-0 flex justify-center">
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
        </span>
        {/* Last in the row and on the text's own baseline — everything before
            it is fixed-width, so the markers line up down the column. */}
        <CandidateSheet race={race} />
      </div>

      <div className="min-w-0">
        <ProbBar poly={polyOdds.data?.dem_prob} kalshi={kalshiProb} />
      </div>

      <div className={ODDS_GROUP}>
        <OddsCell
          label="Polymarket"
          value={polyOdds.data?.dem_prob}
          loading={polyOdds.isLoading}
          url={poly?.market_url}
        />
        <OddsCell
          label="Kalshi"
          value={kalshiProb}
          loading={kalshiLoading}
          url={kalshi?.market_url}
        />
      </div>
    </div>
  );
}

/** Column captions, rendered once at the top of each rating group. */
export function RaceRowHeader({ chamber }: { chamber: Chamber }) {
  return (
    <div
      className={cn(
        ROW_GRID,
        LABEL_COL[chamber],
        "py-2 border-b border-border/60 bg-card/50 text-[10px] uppercase tracking-wider"
      )}
    >
      <div />
      <div />
      <div className={ODDS_GROUP}>
        <span className={cn(ODDS_COL, POLY_COLOR)}>Poly</span>
        <span className={cn(ODDS_COL, KALSHI_COLOR)}>Kalshi</span>
      </div>
    </div>
  );
}

function OddsCell({
  label,
  value,
  loading,
  url,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  url?: string;
}) {
  const text =
    value == null ? (
      <span className={cn("text-muted-foreground", loading && "animate-pulse")}>
        —
      </span>
    ) : (
      `${Math.round(value * 100)}%`
    );

  const className = cn(
    ODDS_COL,
    "block text-sm sm:text-base font-semibold text-foreground"
  );

  if (!url) {
    return <span className={className}>{text}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${label} market`}
      className={cn(
        className,
        "hover:underline underline-offset-4 decoration-muted-foreground/60 hover:text-foreground/90 transition-colors"
      )}
    >
      {text}
    </a>
  );
}
