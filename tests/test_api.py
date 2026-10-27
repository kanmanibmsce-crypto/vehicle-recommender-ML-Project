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
    "branch": "Koramangala Showroom",
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


# -- natural-language search -----------------------------------------------

def _search(client, q, **kw):
    return client.post("/api/search", json={"q": q, "user_id": "test-user", "k": 5, **kw})


def test_search_returns_results(client):
    r = _search(client, "automatic SUV under 15 lakh with sunroof")
    assert r.status_code == 200
    data = r.json()
    assert "results" in data and "parsed_tags" in data and "query" in data
    assert any("15" in t for t in data["parsed_tags"])
    assert any("SUV" in t for t in data["parsed_tags"])
    assert any("Automatic" in t for t in data["parsed_tags"])
    assert any("Sunroof" in t for t in data["parsed_tags"])


def test_search_no_budget_still_works(client):
    r = _search(client, "electric car")
    assert r.status_code == 200
    data = r.json()
    assert len(data["results"]) > 0
    assert any("Electric" in t for t in data["parsed_tags"])


def test_search_budget_range(client):
    r = _search(client, "diesel sedan 10 to 14 lakh")
    assert r.status_code == 200
    data = r.json()
    assert any("10" in t and "14" in t for t in data["parsed_tags"])
    assert any("Diesel" in t for t in data["parsed_tags"])


def test_search_empty_query_rejected(client):
    assert _search(client, "").status_code == 422


# -- test drive update (status / officer / taken date) ---------------------

def test_update_test_drive_status(client):
    vid = _first_vehicle_id(client)
    booking_id = client.post("/api/bookings/test-drive",
                             json={**BOOKING, "vehicle_id": vid}).json()["id"]
    r = client.patch(f"/api/bookings/test-drive/{booking_id}",
                     json={"completed": True, "sales_officer": "Rahul Kumar",
                           "taken_date": "2026-11-16"})
    assert r.status_code == 200 and r.json()["updated"] is True
    bookings = client.get("/api/bookings/test-drive").json()
    b = next(x for x in bookings if x["id"] == booking_id)
    assert b["completed"] == 1
    assert b["sales_officer"] == "Rahul Kumar"
    assert b["taken_date"] == "2026-11-16"
    assert b["branch"] == "Koramangala Showroom"


def test_update_partial_fields(client):
    vid = _first_vehicle_id(client)
    booking_id = client.post("/api/bookings/test-drive",
                             json={**BOOKING, "vehicle_id": vid}).json()["id"]
    # Only update sales_officer; completed and taken_date must stay at defaults
    client.patch(f"/api/bookings/test-drive/{booking_id}",
                 json={"sales_officer": "Anita Rao"})
    b = next(x for x in client.get("/api/bookings/test-drive").json()
             if x["id"] == booking_id)
    assert b["sales_officer"] == "Anita Rao"
    assert b["completed"] == 0
    assert b["taken_date"] is None
