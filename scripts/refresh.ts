/**
 * Merge data/<name>.raw.json + data/<name>.overrides.json → data/<name>.json
 *
 * - Overrides files are hand-edited; raw files come from analyze-cook.ts /
 *   discover-markets.ts.
 * - For races: overrides are matched by race key (chamber + state [+ district])
 *   and deep-merged onto the raw race. Additional races in the overrides file
 *   (not in raw) are appended.
 * - For markets: overrides are deep-merged onto raw at chamber_control.* and
 *   races.*.
 *
 * Run after re-analyzing, or just to apply an edit to overrides.
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.resolve("public/data");

type Json = unknown;

function readJson<T>(file: string, fallback: T): T {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function writeJson(file: string, value: Json) {
  fs.writeFileSync(
    path.join(DATA, file),
    JSON.stringify(value, null, 2) + "\n"
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T>(base: T, over: Partial<T>): T {
  if (!isObject(base) || !isObject(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) {
      out[k] = null;
    } else if (isObject(v) && isObject(out[k])) {
      out[k] = deepMerge(out[k], v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

type Race = {
  chamber: "senate" | "house" | "governor";
  state: string;
  district: number | null;
  [k: string]: unknown;
};

function raceKey(r: Race) {
  if (r.chamber === "senate") return `senate-${r.state}`;
  if (r.chamber === "governor") return `governor-${r.state}`;
  return `house-${r.state}-${String(r.district ?? 0).padStart(2, "0")}`;
}

function mergeRaces() {
  const raw = readJson<Race[]>("races.raw.json", []);
  const overrides = readJson<Race[]>("races.overrides.json", []);

  const byKey = new Map<string, Race>(raw.map((r) => [raceKey(r), r]));
  for (const o of overrides) {
    const k = raceKey(o);
    const existing = byKey.get(k);
    byKey.set(k, existing ? deepMerge(existing, o) : o);
  }
  const out = Array.from(byKey.values()).sort((a, b) =>
    a.chamber !== b.chamber
      ? a.chamber.localeCompare(b.chamber)
      : a.state !== b.state
        ? a.state.localeCompare(b.state)
        : (a.district ?? 0) - (b.district ?? 0)
  );
  writeJson("races.json", out);
  console.log(`races.json: ${out.length} races (${raw.length} raw + ${overrides.length} overrides)`);
}

function mergeMarkets() {
  const raw = readJson<Record<string, unknown>>("markets.raw.json", {
    chamber_control: {
      senate: { polymarket: null, kalshi: null },
      house: { polymarket: null, kalshi: null },
    },
    races: {},
  });
  const overrides = readJson<Record<string, unknown>>(
    "markets.overrides.json",
    {}
  );
  const merged = deepMerge(raw, overrides);
  writeJson("markets.json", merged);
  const raceCount = Object.keys((merged as { races?: object }).races ?? {})
    .length;
  console.log(`markets.json: ${raceCount} race markets + 4 chamber-control`);
}

mergeRaces();
mergeMarkets();
