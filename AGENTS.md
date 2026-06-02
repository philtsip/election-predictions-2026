# AGENTS.md

Project rules for any AI agent (Claude Code, Cursor, etc.) working in this repo.

## Stack

- **React 19** + **Vite 6** (TypeScript).
- **Tailwind CSS v4** — config lives in CSS (`src/index.css` via `@theme` /
  `@utility`), wired through the `@tailwindcss/vite` plugin. There is **no**
  `tailwind.config.js`, `postcss.config.*`, or `autoprefixer` — do not re-add
  them. Animations come from `tw-animate-css`.
- Radix UI primitives (hand-rolled in `src/components/ui/`), React Query for data.

## Package manager — use Bun, not npm

This project uses **bun** as its package manager and TS runner.

- Install deps: `bun install` (not `npm install`).
- Add a dep: `bun add <pkg>` / `bun add -d <pkg>`.
- Run a script: `bun run <name>` or `bun <name>`.
- Run a TS file directly: `bun scripts/foo.ts` (bun runs TS natively — no `tsx` needed).
- Lockfile: `bun.lockb` is the source of truth. **Do not commit `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`** — they are gitignored.

Vercel is configured to install + build via bun (`bun install`, `bun run build`).

## Data files

The dashboard reads two files from `public/data/`:

- `races.json` — the merged, dashboard-ready race list.
- `markets.json` — Polymarket + Kalshi market IDs per race, plus the four chamber-control markets.

Each is produced by merging a `.raw.json` (output of an analysis script) with a
hand-edited `.overrides.json`:

```
races.raw.json   ──┐
                   ├─► refresh.ts ──► races.json    (committed, read by app)
races.overrides.json ─┘
```

Same pattern for markets.

`scripts/outputs/` is a working directory for HTML caches, diff dumps, and
discovery reports. **It is gitignored** — do not commit it.

## Naming

Use "analyze" rather than "scrape" for any script or task that pulls structured
data out of external pages.
