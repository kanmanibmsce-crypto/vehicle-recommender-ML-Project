"""Content-based vehicle recommender.

Pipeline
  1. Build user profile vector  = alpha * explicit + (1 - alpha) * implicit
  2. Hard filters               (budget ceiling, seats, strict fuel/transmission)
  3. Score                      = w_sim * cosine + w_budget * budget_fit
                                  + w_pop * popularity (+ efficiency bonus)
  4. Re-rank with MMR           for diversity
  5. Explain                    each result from facts
"""
from __future__ import annotations

import time
import uuid

import numpy as np
import pandas as pd

from . import config as C
from .events import EventStore
from .explainer import explain, group_contributions
from .features import FeatureEncoder, load_vehicles


def _normalize_rows(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1
    return m / n


class Recommender:
    def __init__(self, vehicles: pd.DataFrame | None = None, store: EventStore | None = None):
        self.df = vehicles if vehicles is not None else load_vehicles()
        self.store = store
        self.encoder = FeatureEncoder().fit(self.df)
        self.matrix = self.encoder.encode_vehicles(self.df)
        self.matrix_n = _normalize_rows(self.matrix)
        self.id_to_idx = {int(vid): i for i, vid in enumerate(self.df["id"])}

    # ---------------------------------------------------------------- profile
    def implicit_profile(self, user_id: str):
        """Recency-decayed, event-weighted average of interacted vehicle vectors."""
        if not self.store:
            return None, 0, None
        rows = self.store.user_interactions(user_id)
        if not rows:
            return None, 0, None
        now = time.time()
        vec = np.zeros(self.encoder.dim)
        total, best_w, best_id = 0.0, 0.0, None
        for vid, et, ts in rows:
            idx = self.id_to_idx.get(int(vid))
            if idx is None:
                continue
            age_days = max(0.0, (now - ts) / 86400)
            w = C.EVENT_WEIGHTS[et] * 0.5 ** (age_days / C.RECENCY_HALF_LIFE_DAYS)
            vec += w * self.matrix_n[idx]
            total += w
            if w > best_w:
                best_w, best_id = w, int(vid)
        if total == 0:
            return None, 0, None
        return vec / total, len(rows), best_id

    def build_profile(self, prefs, user_id: str):
        explicit = self.encoder.encode_preferences(prefs)
        n_exp = np.linalg.norm(explicit)
        explicit_n = explicit / n_exp if n_exp else explicit
        implicit, n_events, anchor_id = self.implicit_profile(user_id)
        if implicit is None:
            return explicit_n, 1.0, False, None
        frac = min(1.0, n_events / C.ALPHA_EVENTS_FOR_MIN)
        alpha = C.ALPHA_NEW_USER - frac * (C.ALPHA_NEW_USER - C.ALPHA_MIN)
        if n_exp == 0:  # no explicit prefs at all -> rely on behaviour
            alpha = 0.0
        return alpha * explicit_n + (1 - alpha) * implicit, round(alpha, 3), True, anchor_id

    # ---------------------------------------------------------------- filters
    def hard_filter(self, prefs) -> np.ndarray:
        df = self.df
        mask = df["price_lakh"] <= prefs.budget_max * (1 + C.BUDGET_TOLERANCE)
        if prefs.min_seats:
            mask &= df["seats"] >= prefs.min_seats
        if prefs.fuel_strict and prefs.fuels:
            mask &= df["fuel"].isin(prefs.fuels)
        if prefs.transmission_strict and prefs.transmission != "any":
            mask &= df["transmission_group"] == prefs.transmission
        return mask.to_numpy()

    @staticmethod
    def budget_fit(prices: np.ndarray, prefs) -> np.ndarray:
        width = C.BUDGET_SOFTNESS * prefs.budget_max
        over = np.clip(prices - prefs.budget_max, 0, None)
        under = np.clip(prefs.budget_min - prices, 0, None)
        return np.exp(-((over / width) ** 2)) * np.exp(-((under / (2 * width)) ** 2))

    def efficiency_score(self, sub: pd.DataFrame) -> np.ndarray:
        mileage = sub["mileage_kmpl"].to_numpy(dtype=float)
        lo, hi = np.nanmin(self.df["mileage_kmpl"]), np.nanmax(self.df["mileage_kmpl"])
        scaled = np.where(np.isnan(mileage), 1.0, (mileage - lo) / max(hi - lo, 1e-9))
        return np.where(sub["fuel"].isin(["electric", "hybrid"]), 1.0, scaled)

    # ---------------------------------------------------------------- ranking
    @staticmethod
    def mmr(scores: np.ndarray, vecs: np.ndarray, k: int, lam: float) -> list[int]:
        """Maximal Marginal Relevance: trade relevance against redundancy."""
        selected: list[int] = []
        candidates = list(np.argsort(-scores))
        while candidates and len(selected) < k:
            if not selected:
                selected.append(candidates.pop(0))
                continue
            sim_to_sel = vecs[candidates] @ vecs[selected].T
            mmr_scores = lam * scores[candidates] - (1 - lam) * sim_to_sel.max(axis=1)
            best = int(np.argmax(mmr_scores))
            selected.append(candidates.pop(best))
        return selected

    def recommend(self, prefs, user_id: str = "anonymous", k: int = 10) -> dict:
        profile, alpha, used_implicit, anchor_id = self.build_profile(prefs, user_id)
        mask = self.hard_filter(prefs)
        idx = np.where(mask)[0]
        rec_id = uuid.uuid4().hex[:12]
        if len(idx) == 0:
            return {"recommendation_id": rec_id, "user_id": user_id, "used_implicit_profile": used_implicit,
                    "alpha": alpha, "candidates_after_filters": 0, "results": []}

        sub = self.df.iloc[idx]
        vecs_n = self.matrix_n[idx]
        sim = vecs_n @ profile if np.linalg.norm(profile) else np.zeros(len(idx))
        bfit = self.budget_fit(sub["price_lakh"].to_numpy(), prefs)
        pop_map = self.store.popularity() if self.store else {}
        pop = np.array([pop_map.get(int(v), 0.0) for v in sub["id"]])
        pop = pop / pop.max() if pop.max() > 0 else pop

        w = C.SCORE_WEIGHTS
        score = w["similarity"] * sim + w["budget_fit"] * bfit + w["popularity"] * pop
        eff = np.zeros(len(idx))
        if "efficiency" in prefs.priorities:
            eff = self.efficiency_score(sub)
            score = score + 0.10 * eff

        order = self.mmr(score, vecs_n, min(k, len(idx)), C.MMR_LAMBDA)
        stats = {"power_p75": float(np.percentile(sub["power_bhp"], 75)),
                 "boot_p75": float(np.percentile(sub["boot_litres"], 75))}
        anchor_name = None
        if anchor_id is not None:
            a = self.df.iloc[self.id_to_idx[anchor_id]]
            anchor_name = f"{a['make']} {a['model']}"
        max_possible = sum(w.values()) + (0.10 if "efficiency" in prefs.priorities else 0)

        results = []
        for rank, j in enumerate(order, start=1):
            v = sub.iloc[j].to_dict()
            gi = idx[j]
            contrib = group_contributions(profile, self.matrix_n[gi], self.encoder.slices)
            similar = None
            if anchor_name and int(v["id"]) != anchor_id and \
                    float(self.matrix_n[gi] @ self.matrix_n[self.id_to_idx[anchor_id]]) > 0.85:
                similar = anchor_name
            reasons, warnings = explain(v, prefs, contrib, stats, similar)
            results.append({
                "rank": rank,
                "vehicle": _clean(v),
                "score": round(float(score[j]), 4),
                "match_pct": int(round(100 * float(score[j]) / max_possible)),
                "reasons": reasons,
                "warnings": warnings,
                "breakdown": {
                    "similarity": round(float(sim[j]), 4),
                    "budget_fit": round(float(bfit[j]), 4),
                    "popularity": round(float(pop[j]), 4),
                    "efficiency": round(float(eff[j]), 4),
                    **{f"sim_{g}": round(c, 4) for g, c in contrib.items()},
                },
            })
        return {"recommendation_id": rec_id, "user_id": user_id, "used_implicit_profile": used_implicit,
                "alpha": alpha, "candidates_after_filters": int(len(idx)), "results": results}


def _clean(v: dict) -> dict:
    """Make a vehicle row JSON-safe (NaN -> None, numpy -> python)."""
    out = {}
    for key, val in v.items():
        if isinstance(val, float) and np.isnan(val):
            out[key] = None
        elif isinstance(val, (np.integer,)):
            out[key] = int(val)
        elif isinstance(val, (np.floating,)):
            out[key] = float(val)
        else:
            out[key] = val
    return out
