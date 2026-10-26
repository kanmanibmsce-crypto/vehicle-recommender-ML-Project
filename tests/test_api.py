import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(db_path=tmp_path / "events.db"))


BODY = {"user_id": "test-user", "k": 5,
        "preferences": {"budget_min": 10, "budget_max": 20, "body_types": ["compact_suv"],
                        "transmission": "automatic", "must_have_features": ["sunroof"]}}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["vehicles"] > 0


def test_options(client):
    assert "features" in client.get("/api/options").json()


def test_recommend_and_metrics_flow(client):
    r = client.post("/api/recommend", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert len(data["results"]) == 5
    first = data["results"][0]
    for et in ["click", "test_drive", "purchase"]:
        e = client.post("/api/events", json={"user_id": "test-user", "event_type": et,
                                             "vehicle_id": first["vehicle"]["id"],
                                             "recommendation_id": data["recommendation_id"], "position": 1})
        assert e.status_code == 201
    client.post("/api/events", json={"user_id": "test-user", "event_type": "feedback",
                                     "vehicle_id": first["vehicle"]["id"], "value": 1})
    m = client.get("/api/metrics").json()
    assert m["impressions"] == 5 and m["ctr"] == 0.2
    assert m["test_drive_rate"] == 1.0 and m["lead_conversion_rate"] == 1.0 and m["csat"] == 1.0


def test_validation_errors(client):
    bad = {**BODY, "preferences": {"budget_min": 30, "budget_max": 10}}
    assert client.post("/api/recommend", json=bad).status_code == 422
    assert client.post("/api/events", json={"user_id": "x", "event_type": "nope"}).status_code == 422
    assert client.post("/api/events", json={"user_id": "x", "event_type": "click", "vehicle_id": 9999}).status_code == 404


def test_index_served(client):
    assert client.get("/").status_code == 200


# -- test drive booking ---------------------------------------------------

def _first_vehicle_id(client):
    r = client.post("/api/recommend", json=BODY)
    return r.json()["results"][0]["vehicle"]["id"]


BOOKING = {
    "user_id": "test-user",
    "name": "Priya Sharma",
    "phone": "9876543210",
    "city": "Bangalore",
    "preferred_date": "2026-11-15",
}


def test_book_test_drive_success(client):
    vid = _first_vehicle_id(client)
    r = client.post("/api/bookings/test-drive", json={**BOOKING, "vehicle_id": vid})
    assert r.status_code == 201
    data = r.json()
    assert data["id"] >= 1 and data["message"] == "Booking confirmed"


def test_book_test_drive_logs_event(client):
    vid = _first_vehicle_id(client)
    client.post("/api/bookings/test-drive", json={**BOOKING, "vehicle_id": vid})
    m = client.get("/api/metrics").json()
    assert m["test_drive_bookings"] >= 1


def test_book_test_drive_invalid_vehicle(client):
    r = client.post("/api/bookings/test-drive", json={**BOOKING, "vehicle_id": 999999})
    assert r.status_code == 404


def test_book_test_drive_validation(client):
    vid = _first_vehicle_id(client)
    # missing required 'name' field
    bad = {k: v for k, v in {**BOOKING, "vehicle_id": vid}.items() if k != "name"}
    assert client.post("/api/bookings/test-drive", json=bad).status_code == 422
