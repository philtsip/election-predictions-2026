# 2026-election-predictions

## Senate Monte Carlo simulator

`scripts/senate_montecarlo.py` answers the question "what is the *real* chance
Democrats win the Senate?" without the (incorrect) trick of averaging the odds
of the seats they need. Winning several seats is a joint probability, not a
mean — so the script simulates the whole competitive map thousands of times.

Run it on a Mac with no installs (Python 3 ships with macOS):

```bash
python3 scripts/senate_montecarlo.py
```

Options:

```bash
python3 scripts/senate_montecarlo.py --sims 500000      # more precision
python3 scripts/senate_montecarlo.py --correlation 0.0  # treat races as independent
python3 scripts/senate_montecarlo.py --correlation 0.5  # strong shared national swing
python3 scripts/senate_montecarlo.py --source A         # use one market column instead of the average
python3 scripts/senate_montecarlo.py --seed 42          # reproducible run
```

The win probabilities in the `RACES` table at the top of the script come from
the dashboard ("CHANCE DEMS CONTROL"); edit them as the odds move.
