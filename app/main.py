"""FastAPI application: recommendation API + event logging + static web UI.

Run:  uvicorn app.main:app --reload
Docs: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import json
import re
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config as C
from .events import EventStore
from .query_parser import parse_query
from .recommender import Recommender, _clean
from .schemas import (CustomerProfile, CustomerProfileIn, EventIn,
                      Preferences, RecommendRequest, RecommendResponse,
                      SearchRequest, SearchResponse, TestDriveBookingIn,
                      TestDriveBookingOut, TestDriveUpdateIn)

_PROFILES_PATH = C.BASE_DIR / "data" / "customer_profiles.json"


def _load_profiles() -> list[dict]:
    if _PROFILES_PATH.exists():
        return json.loads(_PROFILES_PATH.read_text(encoding="utf-8"))
    return []


def _save_profiles(profiles: list[dict]) -> None:
    _PROFILES_PATH.write_text(
        json.dumps(profiles, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _make_id(name: str, existing: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:20] or "profile"
    if base not in existing:
        return base
    return f"{base}_{uuid.uuid4().hex[:4]}"


def create_app(db_path=C.DB_PATH) -> FastAPI:
    app = FastAPI(title="AI Vehicle Recommender", version="0.1.0",
                  description="Content-based vehicle recommendations with explanations.")
    store = EventStore(db_path)
    rec = Recommender(store=store)
    app.state.store, app.state.rec = store, rec

    @app.get("/api/health")
    def health():
        return {"status": "ok", "vehicles": len(rec.df), "vector_dim": rec.encoder.dim}

    @app.get("/api/options")
    def options():
        """Values the UI needs to build the preference form."""
        return {
            "body_types": C.BODY_TYPES,
            "fuels": C.FUELS,
            "transmissions": ["any", *C.TRANSMISSION_GROUPS],
            "features": [{"key": f, "label": C.FEATURE_LABELS[f]} for f in C.FEATURES],
            "priorities": ["safety", "performance", "space", "efficiency"],
            "price_range": [float(rec.df.price_lakh.min()), float(rec.df.price_lakh.max())],
        }

    @app.get("/api/vehicles")
    def vehicles():
        return [_clean(r) for r in rec.df.to_dict(orient="records")]

    @app.get("/api/vehicles/{vehicle_id}")
    def vehicle(vehicle_id: int):
        i = rec.id_to_idx.get(vehicle_id)
        if i is None:
            raise HTTPException(404, "Vehicle not found")
        return _clean(rec.df.iloc[i].to_dict())

    @app.post("/api/recommend", response_model=RecommendResponse)
    def recommend(req: RecommendRequest):
        out = rec.recommend(req.preferences, user_id=req.user_id, k=req.k)
        store.log_impressions(req.user_id, out["recommendation_id"],
                              [r["vehicle"]["id"] for r in out["results"]])
        return out

    @app.post("/api/events", status_code=201)
    def log_event(e: EventIn):
        if e.event_type not in C.VALID_EVENT_TYPES:
            raise HTTPException(422, f"event_type must be one of {sorted(C.VALID_EVENT_TYPES)}")
        if e.vehicle_id is not None and e.vehicle_id not in rec.id_to_idx:
            raise HTTPException(404, "Vehicle not found")
        store.log(e.user_id, e.event_type, e.vehicle_id, e.recommendation_id, e.position, e.value)
        return {"logged": True}

    @app.get("/api/bookings/test-drive")
    def get_bookings():
        return store.get_test_drive_bookings()

    @app.post("/api/bookings/test-drive", response_model=TestDriveBookingOut, status_code=201)
    def book_test_drive(b: TestDriveBookingIn):
        if b.vehicle_id not in rec.id_to_idx:
            raise HTTPException(404, "Vehicle not found")
        booking_id = store.book_test_drive(
            b.user_id, b.vehicle_id, b.name, b.phone, b.city,
            b.preferred_date, b.recommendation_id,
            branch=b.branch, sales_officer=b.sales_officer, taken_date=b.taken_date,
        )
        return {"id": booking_id, "message": "Booking confirmed"}

    @app.patch("/api/bookings/test-drive/{booking_id}", status_code=200)
    def update_booking(booking_id: int, body: TestDriveUpdateIn):
        store.update_test_drive(booking_id, **body.model_dump(exclude_unset=True))
        return {"updated": True}

    @app.post("/api/search", response_model=SearchResponse)
    def search(req: SearchRequest):
        prefs, tags = parse_query(req.q)
        out = rec.recommend(prefs, user_id=req.user_id, k=req.k)
        store.log_impressions(req.user_id, out["recommendation_id"],
                              [r["vehicle"]["id"] for r in out["results"]])
        return {**out, "query": req.q, "parsed_tags": tags}

    @app.get("/api/metrics")
    def metrics():
        return store.metrics()

    @app.get("/api/profiles")
    def list_profiles():
        return _load_profiles()

    @app.post("/api/profiles", status_code=201)
    def create_profile(p: CustomerProfileIn):
        profiles = _load_profiles()
        existing_ids = {pr["id"] for pr in profiles}
        new_id = _make_id(p.name, existing_ids)
        profile = {"id": new_id, **p.model_dump()}
        profiles.append(profile)
        _save_profiles(profiles)
        return profile

    @app.delete("/api/profiles/{profile_id}", status_code=204)
    def delete_profile(profile_id: str):
        profiles = _load_profiles()
        updated = [p for p in profiles if p["id"] != profile_id]
        if len(updated) == len(profiles):
            raise HTTPException(404, "Profile not found")
        _save_profiles(updated)

    static_dir = C.BASE_DIR / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(static_dir / "index.html")

    return app


app = create_app()
