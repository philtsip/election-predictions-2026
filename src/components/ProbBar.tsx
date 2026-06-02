import { cn } from "@/lib/cn";

interface Props {
  /** Dem-win probability for Polymarket, [0, 1] or null */
  poly: number | null | undefined;
  /** Dem-win probability for Kalshi, [0, 1] or null */
  kalshi: number | null | undefined;
  className?: string;
}

/**
 * Horizontal bar 0–100% with a midpoint tick and two markers showing
 * Polymarket (circle) and Kalshi (square). Left half is Dem-tinted,
 * right is Rep-tinted.
 */
export function ProbBar({ poly, kalshi, className }: Props) {
  return (
    <div className={cn("relative w-full select-none", className)}>
      <div className="relative h-2 rounded-full overflow-hidden bg-muted">
        <div
          className="absolute inset-y-0 left-0 right-1/2"
          style={{
            background:
              "linear-gradient(to right, hsl(215 90% 60% / 0.35), hsl(215 90% 60% / 0.15))",
          }}
        />
        <div
          className="absolute inset-y-0 left-1/2 right-0"
          style={{
            background:
              "linear-gradient(to right, hsl(0 75% 62% / 0.15), hsl(0 75% 62% / 0.35))",
          }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
      </div>

      {poly != null && (
        <Marker
          pct={poly}
          color="hsl(215 90% 60%)"
          label="P"
          shape="circle"
        />
      )}
      {kalshi != null && (
        <Marker
          pct={kalshi}
          color="hsl(280 90% 65%)"
          label="K"
          shape="square"
        />
      )}
    </div>
  );
}

function Marker({
  pct,
  color,
  label,
  shape,
}: {
  pct: number;
  color: string;
  label: string;
  shape: "circle" | "square";
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${clamped * 100}%` }}
    >
      <div
        aria-label={label}
        className={cn(
          "h-3 w-3 ring-2 ring-background shadow-md",
          shape === "circle" ? "rounded-full" : "rounded-sm rotate-45"
        )}
        style={{ background: color }}
      />
    </div>
  );
}
