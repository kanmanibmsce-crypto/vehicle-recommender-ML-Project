"""Central configuration: tunable weights and constants for the recommender.

Everything a product/data person may want to tune lives here, so experiments
(A/B tests) only change this file.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "vehicles.csv"
DB_PATH = BASE_DIR / "data" / "events.db"

# --- Feature vocabulary (fixed so vectors are stable across restarts) -------
BODY_TYPES = ["hatchback", "sedan", "micro_suv", "compact_suv", "midsize_suv", "large_suv", "mpv"]
FUELS = ["petrol", "diesel", "cng", "hybrid", "electric"]
TRANSMISSION_GROUPS = ["manual", "automatic"]  # amt/cvt/dct/automatic -> automatic
FEATURES = [
    "sunroof", "six_airbags", "adas", "android_auto", "auto_climate",
    "ventilated_seats", "camera_360", "cruise_control", "wireless_charging", "connected_car",
]
FEATURE_LABELS = {
    "sunroof": "Sunroof",
    "six_airbags": "6 airbags",
    "adas": "ADAS",
    "android_auto": "Android Auto / CarPlay",
    "auto_climate": "Automatic climate control",
    "ventilated_seats": "Ventilated seats",
    "camera_360": "360° camera",
    "cruise_control": "Cruise control",
    "wireless_charging": "Wireless charging",
    "connected_car": "Connected-car tech",
}
NUMERIC_COLS = ["power_bhp", "seats", "boot_litres", "safety_rating"]
# Which numeric column a user "priority" switches on.
PRIORITY_TO_NUMERIC = {
    "performance": "power_bhp",
    "space": "boot_litres",
    "safety": "safety_rating",
}

# --- Feature-group weights (applied when building vectors) ----------------
GROUP_WEIGHTS = {
    "body_type": 2.0,
    "fuel": 1.5,
    "transmission": 1.5,
    "features": 1.0,
    "numeric": 1.0,
}

# --- Scoring --------------------------------------------------------------
SCORE_WEIGHTS = {"similarity": 0.70, "budget_fit": 0.25, "popularity": 0.05}
BUDGET_TOLERANCE = 0.10       # hard filter: allow up to 10% over budget_max
BUDGET_SOFTNESS = 0.15        # gaussian width as a fraction of budget_max
MMR_LAMBDA = 0.85             # 1.0 = pure relevance, 0.0 = pure diversity

# --- Implicit feedback ----------------------------------------------------
EVENT_WEIGHTS = {"click": 1.0, "save": 2.0, "compare": 3.0, "test_drive": 5.0, "purchase": 6.0}
RECENCY_HALF_LIFE_DAYS = 7.0
# alpha = weight of explicit preferences; shrinks as the user interacts more
ALPHA_NEW_USER = 0.85
ALPHA_MIN = 0.55
ALPHA_EVENTS_FOR_MIN = 15

VALID_EVENT_TYPES = {"impression", "click", "save", "compare", "test_drive", "purchase", "feedback"}
