import random

def run_monte_carlo():
    # 1. Base probabilities of Democrats winning each race
    races = {
        "MN": 0.90, "GA": 0.86, "NC": 0.84, "NH": 0.83,
        "MI": 0.70, "ME": 0.66, "AK": 0.62, "OH": 0.55,
        "TX": 0.42, "IA": 0.41, "NE": 0.39
    }

    # CORRECTED BASELINE: Democrats hold 43 seats that are safe or not up.
    # To reach 51 seats, they need to win 8 of the 11 races above.
    SAFE_DEM_SEATS = 43 

    NUM_SIMULATIONS = 10000
    NATIONAL_ERROR_STD_DEV = 0.05 

    dem_win_control = 0  # 51+ seats
    tied_senate = 0      # 50 seats
    rep_win_control = 0  # 49 or fewer seats

    outcomes = {i: 0 for i in range(len(races) + 1)}

    print(f"Running {NUM_SIMULATIONS} simulations with national correlation...\n")

    for _ in range(NUM_SIMULATIONS):
        national_shift = random.gauss(0, NATIONAL_ERROR_STD_DEV)
        seats_won = 0
        
        for state, base_prob in races.items():
            adjusted_prob = max(0.0, min(1.0, base_prob + national_shift))
            if random.random() < adjusted_prob:
                seats_won += 1
                
        outcomes[seats_won] += 1
        
        # Calculate total overall Senate seats for this run
        total_dem_seats = SAFE_DEM_SEATS + seats_won
        
        if total_dem_seats >= 51:
            dem_win_control += 1
        elif total_dem_seats == 50:
            tied_senate += 1
        else:
            rep_win_control += 1

    # Print the Aggregate Percent Summary
    print("=========================================")
    print("       AGGREGATE OUTCOME SUMMARY         ")
    print("=========================================")
    print(f"Democrat Majority (51+ seats): {(dem_win_control / NUM_SIMULATIONS) * 100:>6.2f}%")
    print(f"Tied Senate (50-50)*:          {(tied_senate / NUM_SIMULATIONS) * 100:>6.2f}%")
    print(f"Republican Majority (<50):     {(rep_win_control / NUM_SIMULATIONS) * 100:>6.2f}%")
    print("=========================================")
    print(" *Republicans control a 50-50 Senate via VP tiebreaker.\n")

    # Print individual seat breakdown
    print("--- Detailed Seat Breakdown ---")
    print("Total Dem Seats | Probability")
    print("-----------------------------")
    for seats in range(len(races) + 1):
        probability = (outcomes[seats] / NUM_SIMULATIONS) * 100
        total_seats = SAFE_DEM_SEATS + seats
        if probability > 0.01: 
            print(f"    {total_seats} seats   |   {probability:>5.2f}%")

if __name__ == "__main__":
    run_monte_carlo()