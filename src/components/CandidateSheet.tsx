import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Info } from "lucide-react";
import type { Race } from "@/lib/types";
import { raceLabel } from "@/lib/types";
import { cn } from "@/lib/cn";

const PARTY_LABEL: Record<string, string> = {
  D: "Democrat",
  R: "Republican",
  I: "Independent",
};
const PARTY_COLOR: Record<string, string> = {
  D: "text-dem border-dem/40 bg-dem-soft",
  R: "text-rep border-rep/40 bg-rep-soft",
  I: "text-muted-foreground border-muted-foreground/30 bg-muted/40",
};

export function CandidateSheet({ race }: { race: Race }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Race info"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-serif text-3xl font-normal">
            {raceLabel(race)}
            {race.chamber === "house" && race.pvi && (
              <span className="ml-3 text-base text-muted-foreground tabular">
                PVI {race.pvi}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="uppercase tracking-widest text-[10px]">
            {race.chamber === "senate"
              ? "Senate Race"
              : race.chamber === "governor"
                ? "Governor Race"
                : "House Race"}{" "}
            ·{" "}
            {race.cook_url ? (
              <a
                href={race.cook_url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Cook Political Report
              </a>
            ) : (
              "Cook Political Report"
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {race.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              Candidates not yet confirmed for this race.
            </p>
          ) : (
            <div className="grid gap-3">
              {race.candidates.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-card/50 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold leading-tight">
                        {c.first_name} {c.last_name}
                      </div>
                      {c.is_incumbent && (
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                          Incumbent
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        PARTY_COLOR[c.party] ?? PARTY_COLOR.I
                      )}
                    >
                      {PARTY_LABEL[c.party] ?? c.party}
                    </span>
                  </div>
                  {c.bio && (
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                      {c.bio}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
