#!/usr/bin/env python3
"""
Senate 2026 Monte Carlo simulator
==================================

Why this exists
---------------
It is tempting to take the win probabilities for the seats Democrats need to
flip, average them, and call that "the chance they take the Senate." That is
wrong. Averaging answers a question nobody asked. The chance of winning SEVERAL
seats is about the *joint* probability, not the mean of the individual ones.

  - To win ALL of several independent races you MULTIPLY the probabilities
    (four ~60-85% seats multiplied together is well under the average).
  - Real races are not independent: a good (or bad) national environment moves
    them together. That correlation fattens both tails -- it makes a clean
    sweep AND a total wipeout more likely than independence implies.

This script simulates the whole competitive Senate map many times and reports
how often Democrats actually reach a majority, instead of hand-waving with an
average.

How to run it (on a Mac, nothing to install)
--------------------------------------------
    python3 scripts/senate_montecarlo.py

Useful options:
    python3 scripts/senate_montecarlo.py --sims 500000
    python3 scripts/senate_montecarlo.py --correlation 0.0   # races independent
    python3 scripts/senate_montecarlo.py --correlation 0.5   # strong national swing
    python3 scripts/senate_montecarlo.py --source A           # use only market A
    python3 scripts/senate_montecarlo.py --seed 42            # reproducible run

The numbers below are read straight from the dashboard screenshots
("CHANCE DEMS CONTROL"). Edit the RACES table when the odds move.
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from statistics import NormalDist

# A standard normal, used to convert probabilities <-> "latent strength" so we
# can inject correlation between races in a statistically clean way.
Z = NormalDist()


@dataclass
class Race:
    code: str          # state abbreviation
    held_by: str       # "D" or "R" -- who holds the seat going into 2026
    market_a: float    # Dem win prob from market A (the blue dot), 0..1
    market_b: float | None  # Dem win prob from market B (the green dot), or None

    def dem_prob(self, source: str) -> float:
        """Dem win probability for this race under the chosen source."""
        if source == "A":
            return self.market_a
        if source == "B":
            return self.market_b if self.market_b is not None else self.market_a
        # "avg" -- average the two MARKETS for a single race (this kind of
        # averaging is fine; averaging ACROSS races is the mistake).
        if self.market_b is None:
            return self.market_a
        return (self.market_a + self.market_b) / 2.0


# ---------------------------------------------------------------------------
# The competitive 2026 Senate map, as shown on the dashboard.
# "Dem win prob" = chance the Democrat wins that seat.
# held_by tells us whether a Dem win is a FLIP (R-held) or a HOLD (D-held).
# ---------------------------------------------------------------------------
RACES = [
    # Republican-held -> a Dem win here is a FLIP (+1 net)
    Race("ME", "R", 0.66, 0.57),
    Race("OH", "R", 0.55, None),
    Race("AK", "R", 0.62, 0.60),
    Race("NC", "R", 0.84, 0.86),
    Race("TX", "R", 0.42, 0.42),
    Race("IA", "R", 0.41, 0.41),
    Race("NE", "R", 0.39, 0.35),
    # Democrat-held -> a Dem LOSS here is a flip the wrong way (-1 net)
    Race("MI", "D", 0.70, 0.71),
    Race("GA", "D", 0.86, 0.67),
    Race("NH", "D", 0.83, 0.84),
    Race("MN", "D", 0.90, 0.92),
]

# The four seats the user specifically asked about.
NAMED_FOUR = ["AK", "OH", "ME", "NC"]

# Net seats Democrats must gain across the competitive map to win the majority.
# (Assumes every non-competitive seat holds for its current party; with a
# Republican VP breaking ties, Democrats need 51 seats = net +4.)
NET_NEEDED = 4


def simulate(races, source: str, correlation: float, sims: int, rng: random.Random):
    """
    Run the Monte Carlo.

    Correlation model: each race has a latent "Dem strength" L = sqrt(rho)*Z_nat
    + sqrt(1-rho)*e_i, where Z_nat is a single national-environment shock shared
    by every race and e_i is race-specific noise. Both are standard normals, so
    each L is standard normal with pairwise correlation = rho. The Dem wins race
    i when L_i <= z_i, where z_i is the probability turned into a threshold. This
    reproduces each race's marginal probability exactly while letting a good or
    bad night for Democrats sweep across states together.
    """
    # Precompute per-race thresholds and metadata.
    thresholds = [Z.inv_cdf(r.dem_prob(source)) for r in races]
    is_flip = [r.held_by == "R" for r in races]   # Dem win here = +1 net
    is_hold = [r.held_by == "D" for r in races]    # Dem loss here = -1 net
    named_idx = [i for i, r in enumerate(races) if r.code in NAMED_FOUR]

    a = correlation ** 0.5
    b = (1.0 - correlation) ** 0.5

    majority = 0
    flip_all_named = 0
    net_counts: dict[int, int] = {}

    for _ in range(sims):
        z_nat = rng.gauss(0.0, 1.0)         # shared national environment
        net = 0
        dem_wins = [False] * len(races)
        for i in range(len(races)):
            latent = a * z_nat + b * rng.gauss(0.0, 1.0)
            won = latent <= thresholds[i]
            dem_wins[i] = won
            if won and is_flip[i]:
                net += 1
            elif (not won) and is_hold[i]:
                net -= 1

        net_counts[net] = net_counts.get(net, 0) + 1
        if net >= NET_NEEDED:
            majority += 1
        if all(dem_wins[i] for i in named_idx):
            flip_all_named += 1

    return {
        "majority": majority / sims,
        "flip_all_named": flip_all_named / sims,
        "net_counts": net_counts,
        "sims": sims,
    }


def naive_average(races, source: str, codes) -> float:
    """The (wrong) thing people do: average the win probabilities."""
    probs = [r.dem_prob(source) for r in races if r.code in codes]
    return sum(probs) / len(probs)


def independent_product(races, source: str, codes) -> float:
    """Correct chance of winning ALL of `codes` IF the races were independent."""
    p = 1.0
    for r in races:
        if r.code in codes:
            p *= r.dem_prob(source)
    return p


def main() -> None:
    ap = argparse.ArgumentParser(description="Senate 2026 Monte Carlo simulator")
    ap.add_argument("--sims", type=int, default=200_000, help="number of simulated elections")
    ap.add_argument("--correlation", type=float, default=0.3,
                    help="0..1 national-environment correlation between races (0 = independent)")
    ap.add_argument("--source", choices=["A", "B", "avg"], default="avg",
                    help="which market column to use (default: average the two)")
    ap.add_argument("--seed", type=int, default=None, help="random seed for reproducibility")
    args = ap.parse_args()

    if not 0.0 <= args.correlation <= 1.0:
        ap.error("--correlation must be between 0 and 1")

    rng = random.Random(args.seed)
    res = simulate(RACES, args.source, args.correlation, args.sims, rng)

    named = NAMED_FOUR
    avg = naive_average(RACES, args.source, named)
    indep = independent_product(RACES, args.source, named)

    print("=" * 64)
    print("  SENATE 2026 -- MONTE CARLO")
    print("=" * 64)
    print(f"  simulations      : {args.sims:,}")
    print(f"  market source    : {args.source}")
    print(f"  race correlation : {args.correlation:.2f}")
    print(f"  net seats needed : +{NET_NEEDED}")
    print("-" * 64)
    print(f"  The four named seats: {', '.join(named)}")
    print(f"    Naive average of their odds .......... {avg*100:5.1f}%   <- the wrong number")
    print(f"    Win ALL four, IF independent (product) {indep*100:5.1f}%")
    print(f"    Win ALL four, simulated (corr={args.correlation:.2f}) ... {res['flip_all_named']*100:5.1f}%")
    print("-" * 64)
    print(f"  P(Democratic Senate majority) ......... {res['majority']*100:5.1f}%")
    print("    (across the FULL competitive map, not just four seats)")
    print("-" * 64)
    print("  Distribution of net seat change for Democrats:")
    counts = res["net_counts"]
    lo, hi = min(counts), max(counts)
    peak = max(counts.values())
    for net in range(lo, hi + 1):
        c = counts.get(net, 0)
        share = c / args.sims
        bar = "#" * round(40 * c / peak)
        flag = "  <- majority line" if net == NET_NEEDED else ""
        print(f"    net {net:+d}: {share*100:5.1f}%  {bar}{flag}")
    print("=" * 64)
    print("  Takeaway: the average of the four odds (~{:.0f}%) is meaningless.".format(avg * 100))
    print("  Winning every seat you need is a JOINT event, and it is much")
    print("  harder than any single seat's odds suggest.")
    print("=" * 64)


if __name__ == "__main__":
    main()
