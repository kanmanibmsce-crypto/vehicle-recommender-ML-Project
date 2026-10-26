# Technical Stack

The prototype is deliberately small: one Python service, a CSV catalog, a SQLite event
log and a no-build web UI. Each choice has a clear upgrade path for production.

## Prototype stack

| Layer | Technology | Why |
|---|---|---|
| Language | **Python 3.10+** | The standard for ML; pandas/numpy/scikit-learn ecosystem |
| Data handling | **pandas** | Load and clean the vehicle catalog |
| Vector math | **NumPy** | Feature vectors, cosine similarity, MMR |
| ML utilities | **scikit-learn** | Scaling/encoding helpers; future TF-IDF, model evaluation |
| API | **FastAPI** | Fast, typed, auto-generated OpenAPI docs at `/docs` |
| Validation | **Pydantic v2** | Request/response schemas, input validation |
| Server | **Uvicorn** | ASGI server for FastAPI |
| Catalog storage | **CSV** (`data/vehicles.csv`) | Easy to edit and inspect while prototyping |
| Event storage | **SQLite** (`data/events.db`) | Zero-setup, file-based, real SQL for metrics |
| Frontend | **HTML + CSS + vanilla JavaScript** | No build step; served by FastAPI |
| Testing | **pytest** + FastAPI **TestClient** (httpx) | Unit + API tests |
| Dev tool | **Claude Code** | AI pair-programmer in the terminal (see BUILD_GUIDE) |

## Production stack (recommended upgrade path)

| Concern | Prototype | Production |
|---|---|---|
| Catalog | CSV | **PostgreSQL** (vehicles, variants, features tables) fed by a dealer/OEM data pipeline |
| Events | SQLite | **PostgreSQL** to start; **Kafka / Kinesis → data warehouse** (BigQuery/Snowflake) at scale |
| Vector search | NumPy over all vehicles | **pgvector** or **FAISS** once the catalog exceeds ~50k variants |
| Caching | none | **Redis** for vehicle vectors and popular results |
| Frontend | vanilla JS | **React / Next.js + TypeScript**, Tailwind |
| Auth | anonymous `user_id` in localStorage | Customer accounts (OAuth / OTP) with consent for tracking |
| Text features | not used | **TF-IDF** or **sentence-transformers** embeddings on descriptions/reviews |
| Explanations | templates | Templates + optional **LLM (e.g. Claude API)** to phrase facts naturally |
| Experiments | manual | Feature flags + A/B framework (GrowthBook, Statsig, or in-house) |
| Analytics | `/api/metrics` | Dashboards (Metabase / Superset / Looker) |
| Deployment | `uvicorn` locally | **Docker** → AWS ECS/Fargate, GCP Cloud Run, or Azure Container Apps |
| CI/CD | none | **GitHub Actions**: lint (ruff), type-check (mypy), pytest, offline eval gate |
| Monitoring | logs | Prometheus + Grafana or Datadog; Sentry for errors |

## Local requirements
- Python 3.10 or newer
- pip and venv
- A modern browser
- Optional: Git, Docker, Claude Code

## Dependencies (`requirements.txt`)
```
fastapi, uvicorn[standard], pydantic, pandas, numpy, scikit-learn
pytest, httpx   # tests
```
