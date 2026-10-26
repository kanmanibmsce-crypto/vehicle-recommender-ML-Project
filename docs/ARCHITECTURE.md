# Architecture

## Components

```
┌──────────────────────┐   POST /api/recommend    ┌──────────────────────────────────────┐
│  Web UI (static/)    │ ───────────────────────► │  FastAPI (app/main.py)               │
│  preference form     │ ◄─────────────────────── │                                      │
│  ranked cards        │   ranked list + reasons  │  Recommender (app/recommender.py)    │
│  save / compare /    │                          │   ├─ FeatureEncoder (features.py)    │
│  test drive / 👍👎    │   POST /api/events       │   ├─ Explainer (explainer.py)        │
│                      │ ───────────────────────► │   └─ EventStore (events.py)          │
└──────────────────────┘                          └───────────┬──────────────┬───────────┘
                                                              │              │
                                                    data/vehicles.csv   data/events.db
                                                    (catalog)           (SQLite events)
```

## Startup
1. `load_vehicles()` reads the CSV, splits features, derives `transmission_group`
   (amt/cvt/dct/automatic → automatic), and fills missing numerics with the median.
2. `FeatureEncoder.fit()` learns min/max for numeric columns and the vector layout.
3. Every vehicle is encoded once; the matrix and its row-normalized copy stay in memory.

## Request flow: `POST /api/recommend`
1. **Validate** preferences (Pydantic).
2. **Build profile**: explicit preference vector, blended with an implicit vector from the
   user's past interactions (if any) using weight α.
3. **Hard filters**: budget ceiling (+10%), minimum seats, strict fuel/transmission.
4. **Score**: `0.70·cosine + 0.25·budget_fit + 0.05·popularity` (+0.10·efficiency if prioritised).
5. **Re-rank with MMR** so the list isn't near-duplicates.
6. **Explain** each result (reasons sorted by contribution, plus warnings).
7. **Log impressions** with `recommendation_id` and position for attribution.

## Interaction flow: `POST /api/events`
UI logs `click`, `save`, `compare`, `test_drive`, `feedback`; a dealer/CRM system would log
`purchase`. These events (a) feed the user's implicit profile on the next request and
(b) power `/api/metrics`.

## Key design decisions

| Decision | Reason |
|---|---|
| Content-based filtering first | Works with zero interaction history; new vehicles are recommendable immediately (no item cold-start) |
| Same vector space for users and vehicles | Similarity is a single dot product; explanations fall out of per-group contributions |
| Hard filters + soft scores | Budget breaches frustrate users; soft scoring alone can surface unaffordable cars |
| Group weights in config | Business can tune "body type matters more than features" without code changes |
| Explanations from facts, not generated text | Always accurate and auditable |
| Log impressions, not just clicks | CTR, position bias and A/B tests need the denominator |
| `create_app(db_path)` factory | Tests run against an isolated temporary DB |

## Limitations (and the fix)
- **Over-specialisation**: only shows things similar to stated tastes → MMR now; hybrid
  with collaborative filtering later (ROADMAP).
- **Hand-set weights** → tune via offline eval + A/B tests; later learn-to-rank on logged events.
- **In-memory catalog** → fine to ~50k variants; then pgvector/FAISS.
