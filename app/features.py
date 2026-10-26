"""Turn vehicles (and user preferences) into weighted feature vectors.

Vector layout = [body_type one-hot | fuel one-hot | transmission one-hot |
                 features multi-hot | numeric min-max scaled]
Each block is multiplied by its GROUP_WEIGHTS entry.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config as C


def transmission_group(t: str) -> str:
    return "manual" if str(t).lower() == "manual" else "automatic"


def load_vehicles(path=C.DATA_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["features"] = df["features"].fillna("").apply(
        lambda s: [f for f in str(s).split("|") if f]
    )
    df["transmission_group"] = df["transmission"].apply(transmission_group)
    for col in C.NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].fillna(df[col].median())
    df["price_lakh"] = pd.to_numeric(df["price_lakh"])
    return df.reset_index(drop=True)


@dataclass
class FeatureEncoder:
    """Fits min/max on numeric columns and encodes vehicles/users."""

    slices: dict[str, slice] = field(default_factory=dict)
    num_min: dict[str, float] = field(default_factory=dict)
    num_max: dict[str, float] = field(default_factory=dict)
    dim: int = 0

    def fit(self, df: pd.DataFrame) -> "FeatureEncoder":
        start = 0
        for name, size in [
            ("body_type", len(C.BODY_TYPES)),
            ("fuel", len(C.FUELS)),
            ("transmission", len(C.TRANSMISSION_GROUPS)),
            ("features", len(C.FEATURES)),
            ("numeric", len(C.NUMERIC_COLS)),
        ]:
            self.slices[name] = slice(start, start + size)
            start += size
        self.dim = start
        for col in C.NUMERIC_COLS:
            self.num_min[col] = float(df[col].min())
            self.num_max[col] = float(df[col].max())
        return self

    # -- helpers ----------------------------------------------------------
    def scale(self, col: str, value: float) -> float:
        lo, hi = self.num_min[col], self.num_max[col]
        return 0.0 if hi == lo else float(np.clip((value - lo) / (hi - lo), 0, 1))

    def _apply_weights(self, v: np.ndarray) -> np.ndarray:
        for group, sl in self.slices.items():
            v[sl] *= C.GROUP_WEIGHTS[group]
        return v

    # -- vehicles ---------------------------------------------------------
    def encode_vehicle(self, row: pd.Series) -> np.ndarray:
        v = np.zeros(self.dim)
        s = self.slices
        if row["body_type"] in C.BODY_TYPES:
            v[s["body_type"].start + C.BODY_TYPES.index(row["body_type"])] = 1
        if row["fuel"] in C.FUELS:
            v[s["fuel"].start + C.FUELS.index(row["fuel"])] = 1
        v[s["transmission"].start + C.TRANSMISSION_GROUPS.index(row["transmission_group"])] = 1
        for f in row["features"]:
            if f in C.FEATURES:
                v[s["features"].start + C.FEATURES.index(f)] = 1
        for i, col in enumerate(C.NUMERIC_COLS):
            v[s["numeric"].start + i] = self.scale(col, row[col])
        return self._apply_weights(v)

    def encode_vehicles(self, df: pd.DataFrame) -> np.ndarray:
        return np.vstack([self.encode_vehicle(r) for _, r in df.iterrows()])

    # -- users ------------------------------------------------------------
    def encode_preferences(self, prefs) -> np.ndarray:
        """Map explicit preferences into the same space as vehicles.

        Multi-select choices share weight (1/n) so picking three body types
        doesn't outweigh picking one. Empty choice = neutral (zeros).
        """
        v = np.zeros(self.dim)
        s = self.slices

        def spread(values, vocab, sl):
            vals = [x for x in values if x in vocab]
            for x in vals:
                v[sl.start + vocab.index(x)] = 1.0 / len(vals)

        spread(prefs.body_types, C.BODY_TYPES, s["body_type"])
        spread(prefs.fuels, C.FUELS, s["fuel"])
        if prefs.transmission in C.TRANSMISSION_GROUPS:
            v[s["transmission"].start + C.TRANSMISSION_GROUPS.index(prefs.transmission)] = 1
        for f in prefs.must_have_features:
            if f in C.FEATURES:
                v[s["features"].start + C.FEATURES.index(f)] = 1
        for p in prefs.priorities:
            col = C.PRIORITY_TO_NUMERIC.get(p)
            if col:
                v[s["numeric"].start + C.NUMERIC_COLS.index(col)] = 1
        if prefs.min_seats and prefs.min_seats > 5:
            v[s["numeric"].start + C.NUMERIC_COLS.index("seats")] = self.scale("seats", prefs.min_seats)
        return self._apply_weights(v)
