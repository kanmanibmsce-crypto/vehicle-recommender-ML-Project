# DriveMatch — AI Vehicle Recommender (content-based filtering)

Customers struggle to find vehicles that match their needs. DriveMatch turns each
vehicle into a feature vector, builds a matching vector from the customer's
preferences and behaviour, and returns a **ranked list of vehicles with
plain-language explanations**.

| | |
|---|---|
| **Input** | Vehicle type, budget, fuel, transmission, must-have features, priorities, customer interactions |
| **AI approach** | Content-based filtering: weighted feature vectors + cosine similarity, budget fit, MMR diversity |
| **Output** | Ranked vehicles, match %, reasons and warnings |
| **Success metrics** | Recommendation CTR, test-drive bookings, lead conversion, customer satisfaction (CSAT) |

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload      # open http://127.0.0.1:8000
```

- Web UI: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs

## Useful commands

| Command | What it does |
|---|---|
| `pytest` | Run all tests |
| `python -m scripts.evaluate --users 500` | Offline evaluation (P@5, R@10, NDCG@10, coverage) vs baselines |
| `python -m scripts.simulate_traffic --users 200` | Generate fake traffic so the Metrics panel has data |
| delete `data/events.db` | Reset all logged interactions |

## Project layout

```
vehicle-recommender/
├── CLAUDE.md                 # Instructions Claude Code reads automatically
├── app/
│   ├── config.py             # All tunable weights and vocabularies
│   ├── features.py           # Vehicle + preference → feature vectors
│   ├── recommender.py        # Profile, filters, scoring, MMR ranking
│   ├── explainer.py          # Reasons and warnings for each result
│   ├── events.py             # SQLite event log + success metrics
│   ├── schemas.py            # Pydantic request/response models
│   └── main.py               # FastAPI app + static UI
├── static/                   # index.html, app.js, styles.css (no build step)
├── data/vehicles.csv         # Sample catalog (45 vehicles)
├── scripts/                  # evaluate.py, simulate_traffic.py
├── tests/                    # pytest suite
└── docs/                     # Technical documentation (start with BUILD_GUIDE)
```

## Documentation

| Doc | Purpose |
|---|---|
| [docs/BUILD_GUIDE_CLAUDE_CODE.md](docs/BUILD_GUIDE_CLAUDE_CODE.md) | **Step-by-step process to build and extend this app with Claude Code** |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Every technology used and why; production upgrade path |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, request flow, design decisions |
| [docs/RECOMMENDER_ALGORITHM.md](docs/RECOMMENDER_ALGORITHM.md) | The math: vectors, profile, scoring, MMR, explanations |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Vehicle catalog schema, event schema |
| [docs/API.md](docs/API.md) | Endpoint reference with examples |
| [docs/METRICS_AND_EVALUATION.md](docs/METRICS_AND_EVALUATION.md) | Offline + online evaluation, A/B testing |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What to build next |

> **Data note:** `data/vehicles.csv` is illustrative sample data. Prices, ratings and
> specs are approximate and must be replaced with a verified catalog before real use.
