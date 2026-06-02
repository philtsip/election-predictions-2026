import type { Chamber, ChamberControlMarkets } from "@/lib/types";
import { useOdds } from "@/lib/useOdds";
import { cn } from "@/lib/cn";

interface Props {
  chamber: Chamber;
  markets: ChamberControlMarkets | undefined;
}

export function ChamberCard({ chamber, markets }: Props) {
  const polyOdds = useOdds(
    "polymarket",
    markets?.polymarket ?? null,
    `chamber-${chamber}`
  );
  const kalshiOdds = useOdds(
    "kalshi",
    markets?.kalshi ?? null,
    `chamber-${chamber}`
  );

  const title = chamber === "senate" ? "Senate" : "House";

  const poly = polyOdds.data?.dem_prob ?? null;
  const kalshi = kalshiOdds.data?.dem_prob ?? null;

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden grain">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, hsl(215 90% 60%), hsl(280 90% 65%), transparent)",
        }}
      />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-serif text-5xl sm:text-6xl font-normal leading-none mt-1">
              {title}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 mt-6">
          <Reading
            label="Polymarket"
            markerColor="bg-[hsl(215_90%_60%)]"
            value={poly}
            loading={polyOdds.isLoading}
            url={markets?.polymarket?.market_url}
          />
          <Reading
            label="Kalshi"
            markerColor="bg-[hsl(280_90%_65%)]"
            value={kalshi}
            loading={kalshiOdds.isLoading}
            url={markets?.kalshi?.market_url}
          />
        </div>
      </div>
    </div>
  );
}

function Reading({
  label,
  markerColor,
  value,
  loading,
  url,
}: {
  label: string;
  markerColor: string;
  value: number | null;
  loading: boolean;
  url?: string;
}) {
  const display = value == null ? "—" : `${Math.round(value * 100)}`;
  const content = (
    <div className="group">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", markerColor, loading && "animate-pulse")} />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span className="font-serif text-5xl sm:text-6xl leading-none tabular tracking-tight">
          {display}
        </span>
        {value != null && (
          <span className="text-2xl sm:text-3xl text-muted-foreground font-serif">%</span>
        )}
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          view market ↗
        </a>
      )}
    </div>
  );
  return content;
}
