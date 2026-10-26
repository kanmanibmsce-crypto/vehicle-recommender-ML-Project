"""Human-readable explanations for each recommendation.

Explanations are computed from facts (attribute matches and each feature
group's contribution to cosine similarity), never invented, so they are always
accurate. Reasons are ordered by how much their group contributed to the match.
"""
from __future__ import annotations

import numpy as np

from . import config as C

PRETTY = {
    "hatchback": "Hatchback", "sedan": "Sedan", "micro_suv": "Micro SUV", "compact_suv": "Compact SUV",
    "midsize_suv": "Mid-size SUV", "large_suv": "Large SUV", "mpv": "MPV / 7-seater",
    "petrol": "Petrol", "diesel": "Diesel", "cng": "CNG", "hybrid": "Hybrid", "electric": "Electric",
    "manual": "Manual", "automatic": "Automatic",
}


def pretty(x: str) -> str:
    return PRETTY.get(x, x.replace("_", " ").title())


def group_contributions(user_vec, vehicle_vec, slices) -> dict[str, float]:
    """Split cosine similarity into additive per-group parts."""
    denom = np.linalg.norm(user_vec) * np.linalg.norm(vehicle_vec)
    if denom == 0:
        return {g: 0.0 for g in slices}
    return {g: float(np.dot(user_vec[sl], vehicle_vec[sl]) / denom) for g, sl in slices.items()}


def efficiency_text(v) -> str:
    if v["fuel"] == "electric" and not np.isnan(v.get("range_km", np.nan)):
        return f"{int(v['range_km'])} km claimed range"
    if not np.isnan(v.get("mileage_kmpl", np.nan)):
        unit = "km/kg" if v["fuel"] == "cng" else "km/l"
        return f"{v['mileage_kmpl']:.1f} {unit} claimed mileage"
    return ""


def explain(v: dict, prefs, contrib: dict[str, float], shortlist_stats: dict,
            similar_to: str | None = None) -> tuple[list[str], list[str]]:
    reasons: list[tuple[float, str]] = []
    warnings: list[str] = []

    # Budget (always first; it is the #1 decision factor for buyers)
    price = v["price_lakh"]
    if prefs.budget_min <= price <= prefs.budget_max:
        reasons.append((99, f"₹{price:.1f} L — within your ₹{prefs.budget_min:g}–{prefs.budget_max:g} L budget"))
    elif price > prefs.budget_max:
        pct = (price - prefs.budget_max) / prefs.budget_max * 100
        warnings.append(f"₹{price:.1f} L is {pct:.0f}% above your max budget")
    else:
        reasons.append((98, f"₹{price:.1f} L — below your budget range, leaves room for extras"))

    # Categorical matches
    for key, chosen, value, group in [
        ("Body type", prefs.body_types, v["body_type"], "body_type"),
        ("Fuel", prefs.fuels, v["fuel"], "fuel"),
    ]:
        if chosen:
            if value in chosen:
                reasons.append((contrib.get(group, 0), f"{pretty(value)} {key.lower()}, as you preferred"))
            else:
                warnings.append(f"{key} is {pretty(value)}, not {' / '.join(pretty(c) for c in chosen)}")

    if prefs.transmission != "any":
        tg = v["transmission_group"]
        label = "Manual" if tg == "manual" else (
            "Automatic" if v["transmission"] == "automatic" else f"Automatic ({v['transmission'].upper()})")
        if tg == prefs.transmission:
            reasons.append((contrib.get("transmission", 0), f"{label} transmission, as you preferred"))
        else:
            warnings.append(f"Transmission is {label}, not {pretty(prefs.transmission)}")

    # Must-have features
    if prefs.must_have_features:
        have = [f for f in prefs.must_have_features if f in v["features"]]
        missing = [f for f in prefs.must_have_features if f not in v["features"]]
        if have:
            names = ", ".join(C.FEATURE_LABELS.get(f, f) for f in have)
            reasons.append((contrib.get("features", 0),
                            f"Has {len(have)} of your {len(prefs.must_have_features)} must-haves: {names}"))
        if missing:
            warnings.append("Missing: " + ", ".join(C.FEATURE_LABELS.get(f, f) for f in missing))

    # Priorities
    num = contrib.get("numeric", 0)
    if "safety" in prefs.priorities:
        sr = v["safety_rating"]
        if sr >= 4:
            reasons.append((num, f"{int(sr)}★ crash-test safety rating"))
        elif sr == 0:
            warnings.append("No published crash-test rating in our data")
        else:
            warnings.append(f"Only {int(sr)}★ crash-test rating")
    if "performance" in prefs.priorities and v["power_bhp"] >= shortlist_stats.get("power_p75", 1e9):
        reasons.append((num, f"{int(v['power_bhp'])} bhp — among the most powerful in your shortlist"))
    if "space" in prefs.priorities and v["boot_litres"] >= shortlist_stats.get("boot_p75", 1e9):
        reasons.append((num, f"{int(v['boot_litres'])} L boot — among the roomiest in your shortlist"))
    if "efficiency" in prefs.priorities:
        t = efficiency_text(v)
        if t:
            reasons.append((num, t))
    if prefs.min_seats and v["seats"] >= prefs.min_seats and prefs.min_seats > 5:
        reasons.append((num, f"{int(v['seats'])} seats for your family"))

    if similar_to:
        reasons.append((0.01, f"Similar to the {similar_to} you showed interest in"))

    reasons.sort(key=lambda x: -x[0])
    return [r for _, r in reasons], warnings
