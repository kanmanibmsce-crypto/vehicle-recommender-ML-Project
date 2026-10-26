# CLAUDE.md — project guide for Claude Code

## What this project is
DriveMatch: a **content-based** vehicle recommender. Vehicles and user preferences are
encoded into the same weighted feature space; vehicles are ranked by cosine similarity
plus budget fit, re-ranked for diversity (MMR), and every result is explained.

## Commands
- Install: `pip install -r requirements.txt` (use a `.venv`)
- Run app: `uvicorn app.main:app --reload` → http://127.0.0.1:8000 (API docs at `/docs`)
- Tests: `pytest` (must pass before any change is considered done)
- Offline eval: `python -m scripts.evaluate --users 500`
- Fake traffic for metrics: `python -m scripts.simulate_traffic --users 200`
- Reset events: delete `data/events.db`

## Code map
- `app/config.py` — ALL tunable numbers (group weights, score weights, budget tolerance,
  MMR lambda, event weights, recency half-life). Change behaviour here, not inline.
- `app/features.py` — `FeatureEncoder`: vector layout is
  `[body_type | fuel | transmission | features | numeric]`, each block × GROUP_WEIGHTS.
- `app/recommender.py` — `Recommender.recommend()`: profile → hard filters → score → MMR → explain.
- `app/explainer.py` — reasons/warnings built from facts + per-group cosine contributions.
- `app/events.py` — SQLite `events` table; `metrics()` computes CTR, test-drive rate,
  lead conversion, CSAT, CTR by position.
- `app/main.py` — FastAPI routes; `create_app(db_path)` factory (tests use a temp DB).
- `static/` — vanilla HTML/CSS/JS, no build step. Logs click/save/compare/test_drive/feedback.
- `data/vehicles.csv` — catalog; `features` column is pipe-separated.

## Conventions
- Python 3.10+, type hints, small pure functions; no new heavy dependencies without asking.
- Explanations must be derived from data — never generate claims an attribute doesn't support.
- New vehicle attributes: add column to CSV → vocabulary/weight in `config.py` → encoding in
  `features.py` → explanation in `explainer.py` → a test in `tests/`.
- Every new endpoint gets a Pydantic schema in `schemas.py` and a test in `tests/test_api.py`.
- Any ranking change: run `python -m scripts.evaluate` before and after and report the numbers.
- Keep the UI dependency-free unless we explicitly migrate to React (see docs/ROADMAP.md).

## Docs
Design details live in `docs/` — read `docs/RECOMMENDER_ALGORITHM.md` before changing scoring.
