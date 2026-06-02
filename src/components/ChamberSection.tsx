import type { Chamber, MarketsFile, Race } from "@/lib/types";
import { raceKey } from "@/lib/types";
import { RaceRow } from "./RaceRow";
import { RatingChip, RATING_GROUPS } from "./RatingChip";

interface Props {
  chamber: Chamber;
  races: Race[];
  markets: MarketsFile | undefined;
  includeLean: boolean;
}

export function ChamberSection({ chamber, races, markets, includeLean }: Props) {
  const filtered = races.filter((r) => {
    if (r.chamber !== chamber) return false;
    if (!includeLean && r.cook_rating !== "tossup") return false;
    return true;
  });

  const groups = RATING_GROUPS.map((g) => ({
    ...g,
    races: filtered
      .filter((r) => r.cook_rating === g.rating)
      .sort((a, b) =>
        a.state === b.state
          ? (a.district ?? 0) - (b.district ?? 0)
          : a.state.localeCompare(b.state)
      ),
  })).filter((g) => g.races.length > 0);

  if (groups.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 italic font-serif text-xl">
        No competitive {chamber} races to show.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.rating}>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <div className="flex items-center gap-3">
              <RatingChip rating={g.rating} />
              <h3 className="font-serif text-2xl">{g.title}</h3>
            </div>
            <span className="text-xs text-muted-foreground tabular">
              {g.races.length} race{g.races.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
            {g.races.map((race) => {
              const key = raceKey(race);
              const m = markets?.races?.[key];
              return (
                <RaceRow
                  key={key}
                  race={race}
                  poly={m?.polymarket ?? null}
                  kalshi={m?.kalshi ?? null}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
