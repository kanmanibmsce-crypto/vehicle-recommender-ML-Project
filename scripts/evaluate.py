"""Offline evaluation with synthetic users.

Each synthetic user has a hidden "true" preference. Ground truth = the 5 vehicles
with the highest hidden utility within budget. The recommender only sees a
noisy version of what the user states (people rarely state everything), and we
measure Precision@5, Recall@10, NDCG@10 and catalog coverage against baselines.

Run:  python -m scripts.evaluate --users 500
Replace this with real held-out interaction data once you have it.
"""
from __future__ import annotations

import argparse
import random

import numpy as np

from app import config as C
from app.recommender import Recommender
from app.schemas import Preferences


def hidden_utility(row, h) -> float:
    u = 0.0
    u += 3.0 * (row["body_type"] in h["body_types"])
    u += 2.0 * (row["fuel"] in h["fuels"])
    u += 2.0 * (row["transmission_group"] == h["transmission"])
    u += sum(1.0 for f in h["features"] if f in row["features"])
    u -= 4.0 * max(0.0, row["price_lakh"] - h["budget_max"]) / h["budget_max"]
    return u


def sample_user(df, rng: random.Random):
    anchor = df.iloc[rng.randrange(len(df))]
    body = [anchor["body_type"]] + ([rng.choice(C.BODY_TYPES)] if rng.random() < 0.3 else [])
    feats = rng.sample([f for f in anchor["features"]] or C.FEATURES, k=min(3, max(1, len(anchor["features"]))))
    budget_max = round(anchor["price_lakh"] * rng.uniform(1.0, 1.25), 1)
    return {"body_types": body, "fuels": [anchor["fuel"]], "transmission": anchor["transmission_group"],
            "features": feats, "budget_max": budget_max, "budget_min": round(budget_max * 0.6, 1)}


def stated_prefs(h, rng):
    """What the user actually tells us: incomplete and noisy."""
    return Preferences(
        budget_min=h["budget_min"], budget_max=h["budget_max"],
        body_types=h["body_types"],
        fuels=h["fuels"] if rng.random() < 0.7 else [],
        transmission=h["transmission"] if rng.random() < 0.8 else "any",
        must_have_features=[f for f in h["features"] if rng.random() < 0.7],
    )


def ndcg(ranked, relevant, k):
    dcg = sum(1 / np.log2(i + 2) for i, x in enumerate(ranked[:k]) if x in relevant)
    idcg = sum(1 / np.log2(i + 2) for i in range(min(k, len(relevant))))
    return dcg / idcg if idcg else 0.0


def main(n_users=500, seed=7):
    rng = random.Random(seed)
    rec = Recommender(store=None)
    df = rec.df
    systems = {"content_based": [], "random_in_budget": [], "closest_price": []}
    shown = {s: set() for s in systems}

    for _ in range(n_users):
        h = sample_user(df, rng)
        in_budget = df[df.price_lakh <= h["budget_max"] * (1 + C.BUDGET_TOLERANCE)]
        if len(in_budget) < 5:
            continue
        util = in_budget.apply(lambda r: hidden_utility(r, h), axis=1)
        relevant = set(in_budget.loc[util.nlargest(5).index, "id"])

        p = stated_prefs(h, rng)
        ranked = {
            "content_based": [r["vehicle"]["id"] for r in rec.recommend(p, k=10)["results"]],
            "random_in_budget": rng.sample(list(in_budget.id), k=min(10, len(in_budget))),
            "closest_price": list(in_budget.assign(d=(in_budget.price_lakh - h["budget_max"]).abs())
                                  .nsmallest(10, "d").id),
        }
        for s, ids in ranked.items():
            hits5 = len(set(ids[:5]) & relevant)
            systems[s].append((hits5 / 5, len(set(ids[:10]) & relevant) / len(relevant), ndcg(ids, relevant, 10)))
            shown[s].update(ids)

    print(f"Synthetic users evaluated: {len(systems['content_based'])}\n")
    print(f"{'system':<20}{'P@5':>8}{'R@10':>8}{'NDCG@10':>10}{'coverage':>10}")
    for s, rows in systems.items():
        a = np.array(rows).mean(axis=0)
        print(f"{s:<20}{a[0]:>8.3f}{a[1]:>8.3f}{a[2]:>10.3f}{len(shown[s]) / len(df):>10.0%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=500)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    main(args.users, args.seed)
