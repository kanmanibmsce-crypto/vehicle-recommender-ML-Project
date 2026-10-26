"""Generate fake user traffic through the real API so the metrics dashboard has data.

Users click higher-ranked results more often (position bias), and better
matches convert to test drives and purchases more often.

Run (server not needed):  python -m scripts.simulate_traffic --users 200
Reset data:               delete data/events.db
"""
from __future__ import annotations

import argparse
import random

from fastapi.testclient import TestClient

from app import config as C
from app.main import create_app


def main(n_users: int, seed: int):
    rng = random.Random(seed)
    client = TestClient(create_app())
    for u in range(n_users):
        uid = f"sim_{seed}_{u}"
        budget = rng.choice([8, 10, 12, 15, 18, 22, 28])
        prefs = {
            "budget_min": round(budget * 0.6, 1), "budget_max": budget,
            "body_types": rng.sample(C.BODY_TYPES, k=rng.choice([1, 2])),
            "fuels": rng.sample(C.FUELS, k=rng.choice([0, 1])),
            "transmission": rng.choice(["any", "manual", "automatic"]),
            "must_have_features": rng.sample(C.FEATURES, k=rng.choice([1, 2, 3])),
            "priorities": rng.sample(["safety", "performance", "space", "efficiency"], k=rng.choice([0, 1])),
        }
        out = client.post("/api/recommend", json={"user_id": uid, "preferences": prefs, "k": 10}).json()
        for r in out["results"]:
            pos, match = r["rank"], r["match_pct"] / 100
            base = {"user_id": uid, "vehicle_id": r["vehicle"]["id"],
                    "recommendation_id": out["recommendation_id"], "position": pos}
            if rng.random() < 0.35 * match / pos ** 0.6:
                client.post("/api/events", json={**base, "event_type": "click"})
                if rng.random() < 0.25 * match:
                    client.post("/api/events", json={**base, "event_type": "test_drive"})
                    if rng.random() < 0.3:
                        client.post("/api/events", json={**base, "event_type": "purchase"})
                if rng.random() < 0.4:
                    client.post("/api/events", json={**base, "event_type": "feedback",
                                                     "value": 1 if rng.random() < match else 0})
    m = client.get("/api/metrics").json()
    print({k: v for k, v in m.items() if k != "ctr_by_position"})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=200)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    main(a.users, a.seed)
