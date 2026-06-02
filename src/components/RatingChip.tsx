import type { CookRating } from "@/lib/types";
import { cn } from "@/lib/cn";

const META: Record<CookRating, { label: string; cls: string }> = {
  tossup: {
    label: "Toss Up",
    cls: "bg-tossup-soft text-tossup border-tossup/40",
  },
  lean_d: {
    label: "Lean D",
    cls: "bg-dem-soft text-dem border-dem/40",
  },
  lean_r: {
    label: "Lean R",
    cls: "bg-rep-soft text-rep border-rep/40",
  },
  likely_d: {
    label: "Likely D",
    cls: "bg-dem-soft text-dem border-dem/30 opacity-90",
  },
  likely_r: {
    label: "Likely R",
    cls: "bg-rep-soft text-rep border-rep/30 opacity-90",
  },
};

export function RatingChip({
  rating,
  className,
}: {
  rating: CookRating;
  className?: string;
}) {
  const m = META[rating];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider tabular",
        m.cls,
        className
      )}
    >
      {m.label}
    </span>
  );
}

export const RATING_GROUPS: { rating: CookRating; title: string }[] = [
  { rating: "tossup", title: "Toss Up" },
  { rating: "lean_r", title: "Lean Republican" },
  { rating: "lean_d", title: "Lean Democratic" },
  { rating: "likely_r", title: "Likely Republican" },
  { rating: "likely_d", title: "Likely Democratic" },
];
