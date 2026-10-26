# API Reference

Base URL (local): `http://127.0.0.1:8000`. Interactive docs: `/docs`.

## GET /api/health
```json
{"status": "ok", "vehicles": 45, "vector_dim": 28}
```

## GET /api/options
Vocabularies for building the preference form (body types, fuels, transmissions,
features with labels, priorities, price range).

## GET /api/vehicles, GET /api/vehicles/{id}
Full catalog, or a single vehicle (404 if unknown).

## POST /api/recommend
Request:
```json
{
  "user_id": "u_ab12cd34",
  "k": 10,
  "preferences": {
    "budget_min": 10, "budget_max": 18,
    "body_types": ["compact_suv", "midsize_suv"],
    "fuels": ["petrol"], "fuel_strict": false,
    "transmission": "automatic", "transmission_strict": false,
    "must_have_features": ["sunroof", "adas", "six_airbags"],
    "priorities": ["safety"],
    "min_seats": null
  }
}
```
Response (trimmed):
```json
{
  "recommendation_id": "3f9c1a7b2e10",
  "used_implicit_profile": false,
  "alpha": 1.0,
  "candidates_after_filters": 35,
  "results": [{
    "rank": 1,
    "vehicle": {"id": 20, "make": "Mahindra", "model": "XUV 3XO", "price_lakh": 15.0, "...": "..."},
    "score": 0.7192,
    "match_pct": 76,
    "reasons": ["₹15.0 L — within your ₹10–18 L budget",
                "Has 3 of your 3 must-haves: Sunroof, ADAS, 6 airbags",
                "5★ crash-test safety rating"],
    "warnings": [],
    "breakdown": {"similarity": 0.66, "budget_fit": 1.0, "popularity": 0.0,
                  "sim_body_type": 0.21, "sim_features": 0.25, "...": 0}
  }]
}
```
Validation: `budget_min ≤ budget_max`, `k` 1–30, otherwise 422.

## POST /api/events → 201
```json
{"user_id": "u_ab12cd34", "event_type": "test_drive", "vehicle_id": 20,
 "recommendation_id": "3f9c1a7b2e10", "position": 1}
```
`event_type`: impression, click, save, compare, test_drive, purchase, feedback
(`value`: 1 or 0 for feedback). Unknown type → 422, unknown vehicle → 404.

## GET /api/metrics
```json
{
  "impressions": 960, "recommendation_clicks": 76, "ctr": 0.0792,
  "users_shown_recommendations": 100, "test_drive_bookings": 15, "test_drive_rate": 0.13,
  "purchases": 5, "lead_conversion_rate": 0.3333,
  "feedback_responses": 31, "csat": 0.3871,
  "ctr_by_position": [{"position": 1, "shown": 100, "clicked": 18, "ctr": 0.18}]
}
```

## curl examples
```bash
curl -s localhost:8000/api/recommend -H 'Content-Type: application/json' \
  -d '{"user_id":"demo","preferences":{"budget_max":15,"body_types":["compact_suv"]}}'
curl -s localhost:8000/api/metrics
```
