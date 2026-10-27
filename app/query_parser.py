"""Convert a free-text query into a Preferences object + display tags.

Supports patterns like:
  "automatic SUV under 15 lakh with sunroof"
  "diesel sedan 10-15 lakh family car"
  "electric hatchback with ADAS under 20 lakh"
"""
from __future__ import annotations

import re

from . import config as C
from .schemas import Preferences

_DEFAULT_BUDGET_MAX = 100.0  # used when no budget is mentioned


def _s(pattern: str, text: str) -> re.Match | None:
    return re.search(pattern, text, re.IGNORECASE)


# --------------------------------------------------------------------------- budget

def _extract_budget(text: str) -> tuple[float, float, str | None]:
    # Range: "10 to 15 lakh", "10-15 lakh", "between 10 and 15 lakh"
    m = _s(
        r'(?:between\s+)?(\d+(?:\.\d+)?)\s*(?:lakh|l)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:lakh|l\b)',
        text,
    )
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        return lo, hi, f"₹{lo:g}–{hi:g}L"

    # Max with qualifier: "under 15 lakh", "upto 15L"
    m = _s(
        r'(?:under|below|upto|up\s*to|within|max(?:imum)?|less\s+than)\s*'
        r'₹?\s*(\d+(?:\.\d+)?)\s*(?:lakh|l\b)?',
        text,
    )
    if m:
        hi = float(m.group(1))
        return 0.0, hi, f"≤₹{hi:g}L"

    # ₹15 lakh or ₹15
    m = _s(r'₹\s*(\d+(?:\.\d+)?)\s*(?:lakh|l\b)?', text)
    if m:
        hi = float(m.group(1))
        return 0.0, hi, f"≤₹{hi:g}L"

    # "15 lakh [budget]"
    m = _s(r'(\d+(?:\.\d+)?)\s*(?:lakh|l\b)', text)
    if m:
        hi = float(m.group(1))
        return 0.0, hi, f"≤₹{hi:g}L"

    return 0.0, _DEFAULT_BUDGET_MAX, None


# --------------------------------------------------------------------------- body type

_BODY_LABELS: dict[str, str] = {
    "hatchback": "Hatchback", "sedan": "Sedan", "micro_suv": "Micro SUV",
    "compact_suv": "Compact SUV", "midsize_suv": "Mid-size SUV",
    "large_suv": "Large SUV", "mpv": "MPV",
}


def _extract_body_types(text: str) -> tuple[list[str], str | None]:
    types: list[str] = []
    qualified_suv = False

    for pattern, btype in [
        (r'\bcompact\s*suv\b', "compact_suv"),
        (r'\bmid[\s-]?size\s*suv\b', "midsize_suv"),
        (r'\blarge\s*suv\b', "large_suv"),
        (r'\bmicro[\s-]?suv\b', "micro_suv"),
    ]:
        if _s(pattern, text):
            types.append(btype)
            qualified_suv = True

    if not qualified_suv and _s(r'\bsuv\b', text):
        types.extend(["micro_suv", "compact_suv", "midsize_suv", "large_suv"])

    for pattern, btype in [
        (r'\bhatchback\b', "hatchback"),
        (r'\bsedan\b', "sedan"),
        (r'\bmpv\b|\bminivan\b', "mpv"),
    ]:
        if _s(pattern, text) and btype not in types:
            types.append(btype)

    if not types:
        return [], None

    all_suv = all("suv" in t for t in types)
    if all_suv and len(types) > 1:
        tag = "Any SUV"
    else:
        tag = " / ".join(_BODY_LABELS.get(t, t) for t in types[:2])
    return types, tag


# --------------------------------------------------------------------------- main

def parse_query(q: str) -> tuple[Preferences, list[str]]:
    """Return (Preferences, display_tags).

    display_tags is a list of short strings shown to the user as chips,
    summarising what was understood from the query.
    """
    text = q.lower()
    tags: list[str] = []

    # budget
    bmin, bmax, btag = _extract_budget(text)
    if btag:
        tags.append(btag)

    # body type
    body_types, btag2 = _extract_body_types(text)
    if btag2:
        tags.append(btag2)

    # fuel
    fuels: list[str] = []
    for pattern, fuel in [
        (r'\belectric\b|\bev\b|\bbev\b', "electric"),
        (r'\bdiesel\b', "diesel"),
        (r'\bcng\b', "cng"),
        (r'\bhybrid\b', "hybrid"),
        (r'\bpetrol\b|\bgasoline\b', "petrol"),
    ]:
        if _s(pattern, text) and fuel not in fuels:
            fuels.append(fuel)
    if fuels:
        tags.append(" / ".join(f.capitalize() for f in fuels))

    # transmission
    transmission = "any"
    if _s(r'\bautomatic\b|\bamt\b|\bdct\b|\bcvt\b', text):
        transmission = "automatic"
        tags.append("Automatic")
    elif _s(r'\bmanual\b', text):
        transmission = "manual"
        tags.append("Manual")

    # must-have features
    must_have: list[str] = []
    for pattern, feat in [
        (r'\bsunroof\b|\bmoonroof\b', "sunroof"),
        (r'\b(?:6|six)[\s-]?airbags?\b|\bairbags?\b', "six_airbags"),
        (r'\badas\b|\blane[\s-]?assist\b|\bcollision[\s-]?warning\b', "adas"),
        (r'\bandroid[\s-]?auto\b|\bcarplay\b|\bapple[\s-]?carplay\b', "android_auto"),
        (r'\bclimate[\s-]?control\b|\bauto[\s-]?climate\b|\bauto[\s-]?ac\b', "auto_climate"),
        (r'\bventilated[\s-]?seats?\b|\bcooled[\s-]?seats?\b', "ventilated_seats"),
        (r'\b360[\s-]?(?:degree|°)?[\s-]?camera\b|\bsurround[\s-]?view\b', "camera_360"),
        (r'\bcruise[\s-]?control\b', "cruise_control"),
        (r'\bwireless[\s-]?charg(?:ing|er)\b', "wireless_charging"),
        (r'\bconnected[\s-]?car\b', "connected_car"),
    ]:
        if _s(pattern, text) and feat not in must_have:
            must_have.append(feat)
    if must_have:
        tags.append(", ".join(C.FEATURE_LABELS.get(f, f) for f in must_have))

    # priorities
    priorities: list[str] = []
    for pattern, pri in [
        (r'\bsafe(?:ty|st)?\b|\bncap\b|\bcrash[\s-]?test\b', "safety"),
        (r'\bpowerful\b|\bperformance\b|\bfast\b|\bsport(?:y)?\b', "performance"),
        (r'\bspacious\b|\bfamily\b|\broomy\b|\bboot\s*space\b', "space"),
        (r'\bfuel[\s-]?effici(?:ent|ency)\b|\bmileage\b|\beffici(?:ent|ency)\b', "efficiency"),
    ]:
        if _s(pattern, text) and pri not in priorities:
            priorities.append(pri)
    _PRI_LABELS = {"safety": "Safe", "performance": "Performance", "space": "Spacious", "efficiency": "Efficient"}
    if priorities:
        tags.append(", ".join(_PRI_LABELS[p] for p in priorities))

    # min seats
    min_seats: int | None = None
    m = _s(r'(\d+)[\s-]?seat(?:er|s)?\b', text)
    if m:
        n = int(m.group(1))
        if 2 <= n <= 9:
            min_seats = n
            tags.append(f"{n}+ seats")
            if n >= 7 and "mpv" not in body_types:
                body_types.append("mpv")

    return (
        Preferences(
            budget_min=bmin,
            budget_max=bmax,
            body_types=body_types,
            fuels=fuels,
            transmission=transmission,
            must_have_features=must_have,
            priorities=priorities,
            min_seats=min_seats,
        ),
        tags,
    )
