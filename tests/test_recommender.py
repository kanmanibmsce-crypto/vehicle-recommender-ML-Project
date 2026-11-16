import numpy as np
import pytest

from app import config as C
from app.events import EventStore
from app.features import FeatureEncoder, load_vehicles
from app.recommender import Recommender
from app.schemas import Preferences


@pytest.fixture
def rec(tmp_path):
    return Recommender(store=EventStore(tmp_path / "events.db"))


def prefs(**kw):
    base = dict(budget_min=10, budget_max=18)
    base.update(kw)
    return Preferences(**base)


def test_vectors_have_expected_dimension():
    df = load_vehicles()
    enc = FeatureEncoder().fit(df)
    expected = len(C.BODY_TYPES) + len(C.FUELS) + len(C.TRANSMISSION_GROUPS) + len(C.FEATURES) + len(C.NUMERIC_COLS)
    assert enc.dim == expected
    assert enc.encode_vehicles(df).shape == (len(df), expected)


def test_budget_ceiling_is_respected(rec):
    out = rec.recommend(prefs(budget_min=5, budget_max=12), k=30)
    assert out["results"]
    assert all(r["vehicle"]["price_lakh"] <= 12 * (1 + C.BUDGET_TOLERANCE) for r in out["results"])


def test_strict_fuel_filter(rec):
    out = rec.recommend(prefs(budget_max=30, fuels=["electric"], fuel_strict=True), k=30)
    assert out["results"] and {r["vehicle"]["fuel"] for r in out["results"]} == {"electric"}


def test_min_seats_filter(rec):
    out = rec.recommend(prefs(budget_max=40, min_seats=7), k=30)
    assert all(r["vehicle"]["seats"] >= 7 for r in out["results"])


def test_top_result_matches_clear_preferences(rec):
    p = prefs(budget_max=18, body_types=["compact_suv"], fuels=["petrol"], transmission="automatic",
              must_have_features=["sunroof", "adas"])
    top = rec.recommend(p, k=3)["results"][0]["vehicle"]
    assert top["body_type"] == "compact_suv" and top["fuel"] == "petrol"
    assert top["transmission_group"] == "automatic"


def test_results_are_ranked_and_explained(rec):
    out = rec.recommend(prefs(body_types=["sedan"], must_have_features=["sunroof"]), k=5)
    ranks = [r["rank"] for r in out["results"]]
    assert ranks == list(range(1, len(ranks) + 1))
    for r in out["results"]:
        assert r["reasons"], "every result needs at least one reason"
        assert 0 <= r["match_pct"] <= 100


def test_missing_features_are_flagged(rec):
    # Urban Cruiser Taisor (₹12.78) lacks ADAS — should appear with a warning
    out = rec.recommend(prefs(budget_min=10, budget_max=15, must_have_features=["adas"]), k=5)
    assert any("Missing: ADAS" in w for r in out["results"] for w in r["warnings"])


def test_impossible_filters_return_empty(rec):
    out = rec.recommend(prefs(budget_min=1, budget_max=3), k=5)
    assert out["results"] == [] and out["candidates_after_filters"] == 0


def test_implicit_profile_kicks_in(rec):
    rec.store.log("u1", "test_drive", vehicle_id=59)   # Urban Cruiser Ebella (electric SUV)
    rec.store.log("u1", "save", vehicle_id=46)         # Urban Cruiser Hyryder (hybrid SUV)
    out = rec.recommend(prefs(budget_max=30), user_id="u1", k=5)
    assert out["used_implicit_profile"] and out["alpha"] < 1
    assert out["results"][0]["vehicle"]["fuel"] == "electric"


def test_mmr_returns_unique_items():
    scores = np.array([0.9, 0.89, 0.5])
    vecs = np.eye(3)
    assert sorted(Recommender.mmr(scores, vecs, 3, 0.7)) == [0, 1, 2]
