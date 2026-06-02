/**
 * Analyze Cook Political race ratings for competitive 2026 races.
 *
 * Approach:
 *   1. Fetch /ratings/senate-race-ratings and /ratings/house-race-ratings.
 *   2. Parse the static-rendered "race-card" blocks to get rating + state + race link.
 *      Cards are server-rendered HTML — no JS needed.
 *   3. For each competitive race (tossup / lean_d / lean_r / likely_d / likely_r),
 *      fetch the /senate/race/{id} or /house/race/{id} detail page.
 *   4. Extract:
 *        - chamber/state/district (from <title>)
 *        - current cook_rating (right side of rating block, fall back to left)
 *        - PVI (from tooltip span)
 *        - incumbent name/party (from race-type-person block, when status != OPEN)
 *        - incumbent full bio (from incumbentFullBio modal)
 *      Non-incumbent candidate names are paywalled on cookpolitical.com
 *      ("Sign in to view") — we leave them for the enrichment pass / human review.
 *   5. Cache raw HTML in scripts/outputs/cook-html/ — rerunning the script reuses
 *      the cache so it's idempotent and cheap.
 *
 * Usage:
 *   bun run analyze                       # use cache where present
 *   bun run scripts/analyze-cook.ts --refresh  # ignore cache, re-download all
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as cheerio from "cheerio";

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "scripts/outputs/cook-html");
const OUT_FILE = path.join(ROOT, "public/data/races.raw.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const REFRESH = process.argv.includes("--refresh");

const COMPETITIVE = new Set([
  "tossup",
  "lean-d",
  "lean-r",
  "likely-d",
  "likely-r",
]);

const RATING_NORMALIZE: Record<string, string> = {
  tossup: "tossup",
  "toss-up": "tossup",
  "lean-d": "lean_d",
  "lean-r": "lean_r",
  "likely-d": "likely_d",
  "likely-r": "likely_r",
  "solid-d": "solid_d",
  "solid-r": "solid_r",
};

const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

async function fetchCached(url: string, cacheName: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, cacheName);
  if (!REFRESH && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }
  // Cloudflare in front of cookpolitical.com 403s Node's undici fetch (likely
  // TLS-fingerprint based). curl works fine. Shell out + retry with backoff.
  const delays = [3000, 15000, 45000];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const body = execFileSync(
        "curl",
        [
          "-s", "--fail-with-body", "--compressed",
          "-A", UA,
          "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "-H", "Accept-Language: en-US,en;q=0.9",
          "-H", "Referer: https://www.cookpolitical.com/ratings",
          url,
        ],
        { maxBuffer: 50 * 1024 * 1024, encoding: "utf8" },
      );
      if (!body || body.length < 1000) {
        lastErr = new Error(`Suspiciously short body (${body.length}) for ${url}`);
        continue;
      }
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, body);
      return body;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

interface IndexRace {
  chamber: "senate" | "house";
  cookRatingRaw: string;   // tossup|lean-d|...
  state: string;           // 2-letter (senate) or first part of "AZ-01"
  raceLabel: string;       // e.g. "Collins", "OPEN", "01"
  raceId: string;
  url: string;
}

function parseIndex(html: string, chamber: "senate" | "house"): IndexRace[] {
  const $ = cheerio.load(html);
  const out: IndexRace[] = [];
  $(".race-card").each((_, card) => {
    const $card = $(card);
    const category = ($card.attr("data-category") || "").trim();
    if (!COMPETITIVE.has(category)) return;
    $card.find("li.race-item").each((__, li) => {
      const $li = $(li);
      const href = $li.find("a.race-link").attr("href") || "";
      const m = href.match(/\/(senate|house)\/race\/(\d+)/);
      if (!m) return;
      const stateOrDist = $li.find(".race-district").text().trim();
      const raceName = $li.find(".race-name").text().trim();
      out.push({
        chamber,
        cookRatingRaw: category,
        state: stateOrDist,
        raceLabel: raceName,
        raceId: m[2],
        url: `https://www.cookpolitical.com${href}`,
      });
    });
  });
  return out;
}

interface Candidate {
  first_name: string;
  last_name: string;
  party: "D" | "R" | "I";
  is_incumbent: boolean;
  bio: string | null;
}

interface RaceRecord {
  chamber: "senate" | "house";
  state: string;
  district: number | null;
  cook_rating: string;
  pvi: string | null;
  cook_url: string;
  candidates: Candidate[];
}

function parsePvi(pviRaw: string): string | null {
  // Tooltip text is "D +4" / "R +10" / "EVEN"
  const s = pviRaw.replace(/\s+/g, "").toUpperCase();
  if (!s) return null;
  if (s === "EVEN" || s === "R+0" || s === "D+0") return "EVEN";
  const m = s.match(/^([DR])\+?(\d+)$/);
  if (!m) return s;
  return `${m[1]}+${m[2]}`;
}

function parseDetail(html: string, idx: IndexRace): RaceRecord | null {
  const $ = cheerio.load(html);

  // Title: "CA-13 2026 | Cook Political Report" or "Maine Senate 2026 | ..."
  const title = ($("title").text() || "").trim();

  let state = "";
  let district: number | null = null;
  if (idx.chamber === "house") {
    // Titles vary: "CA-13 2026 | ...", "Nevada NV-03 House : 2026 | ...",
    // "AK-AL 2026 | ..." for at-large states.
    let m = title.match(/\b([A-Z]{2})-(\d+)\b/);
    if (m) {
      state = m[1];
      district = parseInt(m[2], 10);
    } else {
      const al = title.match(/\b([A-Z]{2})-AL\b/);
      if (al) {
        state = al[1];
        district = 0; // at-large = "00"
      }
    }
  } else {
    // Senate title like "Maine Senate 2026"
    const m = title.match(/^([A-Za-z .]+?)\s+Senate\s+2026/);
    if (m) {
      const name = m[1].trim();
      state = STATE_NAME_TO_ABBR[name] || idx.state;
    } else {
      state = idx.state;
    }
  }

  // Current cook rating: prefer the "right" half (post-change). Fall back to "left".
  const ratingRight = $(".analysis-detail-page-block-body-race-rating-data-right")
    .attr("class") || "";
  const ratingLeft = $(".analysis-detail-page-block-body-race-rating-data-left")
    .attr("class") || "";
  const ratingClass =
    pickRatingClass(ratingRight) || pickRatingClass(ratingLeft) || idx.cookRatingRaw;
  const cook_rating = RATING_NORMALIZE[ratingClass] || ratingClass;

  // PVI from tooltip span
  const pviRaw =
    $(".analysis-detail-page-block-body-partisan-data-tooltip span").first().text() || "";
  const pvi = parsePvi(pviRaw);

  // Incumbent / open seat
  const status = $(".analysis-detail-page-block-body-race-type-status").text().trim();
  const personBlock = $(".analysis-detail-page-block-body-race-type-person").text().trim();
  // personBlock is like "Susan Collins\n(R)" or "Gary Peters\n(D)"
  const personMatch = personBlock.match(/^(.+?)\s*\(([DRI])\)\s*$/s);

  const candidates: Candidate[] = [];
  if (personMatch && /incumbent/i.test(status)) {
    const fullName = personMatch[1].trim().replace(/\s+/g, " ");
    const party = personMatch[2] as "D" | "R" | "I";
    const { first, last } = splitName(fullName);
    // Bio from the hidden modal
    const bio =
      $(".analysis-detail-page-personality-incumbent-info-bio-modal " +
        ".analysis-detail-page-personality-incumbent-info-data span")
        .filter((_, el) => $(el).text().length > 80)
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null;
    candidates.push({
      first_name: first,
      last_name: last,
      party,
      is_incumbent: true,
      bio,
    });
  }

  return {
    chamber: idx.chamber,
    state,
    district,
    cook_rating,
    pvi,
    cook_url: idx.url,
    candidates,
  };
}

function pickRatingClass(classAttr: string): string | null {
  for (const key of [
    "tossup", "toss-up", "lean-d", "lean-r", "likely-d", "likely-r",
    "solid-d", "solid-r",
  ]) {
    if (classAttr.split(/\s+/).includes(key)) return key === "toss-up" ? "tossup" : key;
  }
  return null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  console.log("Fetching index pages...");
  const senateIdx = await fetchCached(
    "https://www.cookpolitical.com/ratings/senate-race-ratings",
    "senate-ratings.html",
  );
  const houseIdx = await fetchCached(
    "https://www.cookpolitical.com/ratings/house-race-ratings",
    "house-ratings.html",
  );

  const senateRaces = parseIndex(senateIdx, "senate");
  const houseRaces = parseIndex(houseIdx, "house");
  console.log(`Competitive races: senate=${senateRaces.length} house=${houseRaces.length}`);

  const all: IndexRace[] = [...senateRaces, ...houseRaces];
  const out: RaceRecord[] = [];

  let i = 0;
  for (const r of all) {
    i++;
    const cacheName = `${r.chamber}-${r.raceId}.html`;
    let html: string;
    try {
      html = await fetchCached(r.url, cacheName);
    } catch (e) {
      console.error(`  [${i}/${all.length}] FAIL ${r.url}: ${(e as Error).message}`);
      continue;
    }
    const rec = parseDetail(html, r);
    if (rec) {
      out.push(rec);
      console.log(
        `  [${i}/${all.length}] ${rec.chamber} ${rec.state}` +
        `${rec.district != null ? "-" + String(rec.district).padStart(2, "0") : ""}` +
        ` ${rec.cook_rating} pvi=${rec.pvi}`,
      );
    }
    // Save progress incrementally so partial results survive interruption
    if (i % 10 === 0) {
      fs.writeFileSync(OUT_FILE + ".partial", JSON.stringify(out, null, 2));
    }
  }

  out.sort((a, b) => {
    if (a.chamber !== b.chamber) return a.chamber.localeCompare(b.chamber);
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return (a.district ?? 0) - (b.district ?? 0);
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} races to ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
