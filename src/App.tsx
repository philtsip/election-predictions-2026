import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ChamberCard } from "@/components/ChamberCard";
import { ChamberSection } from "@/components/ChamberSection";
import { KalshiBatchProvider } from "@/lib/kalshiBatch";
import { useMarkets, useRaces } from "@/lib/useData";

export default function App() {
  const [includeLean, setIncludeLean] = useState(true);
  const racesQ = useRaces();
  const marketsQ = useMarkets();

  return (
    <KalshiBatchProvider markets={marketsQ.data}>
    <div className="min-h-screen pb-24">
      <Header includeLean={includeLean} onIncludeLeanChange={setIncludeLean} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 sm:mt-12 space-y-12">
        <section className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          <ChamberCard chamber="senate" markets={marketsQ.data?.chamber_control.senate} />
          <ChamberCard chamber="house" markets={marketsQ.data?.chamber_control.house} />
        </section>

        {racesQ.isLoading && <LoadingState />}
        {racesQ.error && <ErrorState message={String(racesQ.error)} />}

        {racesQ.data && (
          <>
            <ChamberBlock
              title="Senate"
              subtitle="33 seats up · Dems defend 13, Reps defend 20"
            >
              <ChamberSection
                chamber="senate"
                races={racesQ.data}
                markets={marketsQ.data}
                includeLean={includeLean}
              />
            </ChamberBlock>

            <ChamberBlock
              title="House"
              subtitle="all 435 seats · majority = 218"
            >
              <ChamberSection
                chamber="house"
                races={racesQ.data}
                markets={marketsQ.data}
                includeLean={includeLean}
              />
            </ChamberBlock>

            <ChamberBlock
              title="Governor"
              subtitle="36 seats up · tracking GA & OH"
            >
              <ChamberSection
                chamber="governor"
                races={racesQ.data}
                markets={marketsQ.data}
                includeLean={includeLean}
              />
            </ChamberBlock>
          </>
        )}
      </main>

      <Footer />
    </div>
    </KalshiBatchProvider>
  );
}

function Header({
  includeLean,
  onIncludeLeanChange,
}: {
  includeLean: boolean;
  onIncludeLeanChange: (v: boolean) => void;
}) {
  return (
    <header className="border-b border-border/40 sticky top-0 z-30 backdrop-blur-xl bg-background/70">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="font-serif text-xl sm:text-2xl leading-none truncate">
              2026 Election Predictions
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Chance Dems control
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
          <span className="text-xs sm:text-sm text-muted-foreground hidden xs:inline">
            Include lean
          </span>
          <span className="text-xs sm:text-sm text-muted-foreground xs:hidden">
            Lean
          </span>
          <Switch
            checked={includeLean}
            onCheckedChange={onIncludeLeanChange}
            aria-label="Include lean races"
          />
        </label>
      </div>
    </header>
  );
}

function ChamberBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-4 mb-6 sm:mb-8">
        <h2 className="font-serif text-5xl sm:text-7xl leading-none">{title}</h2>
        <div className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="py-24 text-center text-muted-foreground font-serif italic text-xl">
      Loading races…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="py-16 rounded-xl border border-rep/40 bg-rep-soft text-rep px-6">
      <div className="font-semibold mb-1">Couldn't load race data</div>
      <div className="text-sm font-mono opacity-80">{message}</div>
      <div className="text-xs text-muted-foreground mt-3">
        Expected <code>/data/races.json</code> in public/. Run{" "}
        <code>bun run analyze</code> to generate it.
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-4 sm:px-6 mt-24 text-xs text-muted-foreground">
      <div className="border-t border-border/40 pt-6 flex flex-wrap gap-x-6 gap-y-2">
        <span>Probabilities = market prices.</span>
        <span>Ratings: Cook Political Report</span>
      </div>
    </footer>
  );
}
