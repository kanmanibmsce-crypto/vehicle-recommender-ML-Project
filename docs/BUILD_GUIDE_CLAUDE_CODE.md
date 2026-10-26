# Step-by-Step Build Guide with Claude Code

This guide has two tracks:

- **Track A:** run this prototype and keep building on it with Claude Code (recommended).
- **Track B:** rebuild it from scratch, phase by phase, with Claude Code, to learn every piece.

Each step has a **prompt to paste into Claude Code** and a **checkpoint** to confirm it worked.

---

## Step 0 — Prerequisites

| Need | Check |
|---|---|
| Python 3.10+ | `python --version` |
| Git | `git --version` |
| Claude Code | `claude --version` |
| A Claude Pro, Max, Team, Enterprise or Console account | Claude Code needs one; the free plan doesn't include it |

**Install Claude Code** (official native installer):

```bash
# macOS / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex

# or Homebrew (macOS)
brew install --cask claude-code
```

Then run `claude` once and sign in. Install details change over time, so check the
official setup page if a command fails: https://code.claude.com/docs/en/setup

---

## Step 1 — Set up the project

```bash
# unzip the project, then:
cd vehicle-recommender
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest                               # expect: 15 passed
git init && git add . && git commit -m "Initial prototype"
```

**Checkpoint:** `uvicorn app.main:app --reload` → open http://127.0.0.1:8000, set
preferences, get ranked cards with reasons.

---

## Step 2 — Start Claude Code in the project

```bash
cd vehicle-recommender
claude
```

Claude Code reads `CLAUDE.md` automatically. It tells Claude the commands, code map and
conventions, so you don't need to re-explain the project each session.

First prompt:
```
Read CLAUDE.md and docs/ARCHITECTURE.md, then explain how a request to /api/recommend
flows through the code. Don't change anything yet.
```

### Working habits that pay off
- **Plan before big changes:** ask "make a plan first, don't write code yet", or switch to
  plan mode (Shift+Tab cycles modes). Approve the plan, then let it implement.
- **One feature per session.** Use `/clear` between unrelated tasks to keep context focused.
- **Always end with verification:** "run pytest and the offline eval, show me the numbers".
- **Commit after each green step:** "commit this with a clear message".
- **Review diffs.** Claude Code asks permission before editing files and running commands.
- **Update docs:** "update CLAUDE.md and the relevant docs/ file to reflect this change".

---

## Track A — Extend the prototype (recommended order)

### A1. Load your real vehicle catalog
```
I have a vehicle catalog at data/my_catalog.csv with these columns: <paste header>.
Write scripts/import_catalog.py that maps it into the schema in docs/DATA_MODEL.md,
reports rows it had to drop and why, and writes data/vehicles.csv.
Add any new features to config.FEATURES and FEATURE_LABELS. Run pytest.
```
**Checkpoint:** app loads your catalog; `/api/health` shows the new vehicle count.

### A2. Add a new attribute (example: ground clearance)
```
Add ground_clearance_mm as a numeric attribute following the "Adding a new attribute"
steps in docs/DATA_MODEL.md. Add an "off-road" priority that switches it on, an
explanation like "209 mm ground clearance — good for rough roads", and tests.
Run pytest and scripts.evaluate before and after.
```

### A3. Test-drive booking form
```
Replace the "Book test drive" button action with a modal that collects name, phone,
preferred dealer city and date. Add POST /api/test-drives with a Pydantic schema and a
SQLite table, still logging the test_drive event with recommendation_id and position.
Validate phone numbers. Add API tests.
```

### A4. Compare view
```
Add a compare tray: users can add up to 3 vehicles, then see a side-by-side table of
price, fuel, transmission, power, seats, boot, safety, mileage/range and features,
with the user's must-haves highlighted. Log a compare event for each vehicle.
```

### A5. Tune the ranking with evidence
```
Run scripts.evaluate with 1000 users for these settings and give me a results table:
MMR_LAMBDA in [0.7, 0.85, 1.0] and body_type group weight in [1.5, 2.0, 3.0].
Recommend a setting and explain the trade-off between accuracy and diversity.
Don't change config.py until I approve.
```

### A6. Natural-language search
```
Add a search box: "automatic SUV under 15 lakh with sunroof for a family of 6".
Write app/nl_parser.py that turns text into a Preferences object. Start with a
rule-based parser (regex for budget, keywords for body/fuel/transmission/features),
with tests for 15 example queries. Keep it swappable for an LLM later.
```

### A7. LLM-polished explanations (optional)
```
Add an optional explanation rewriter using the Claude API (Anthropic Python SDK).
Input: the computed reasons and warnings only. Output: 2 friendly sentences that must not
add any claim not in the input. Read the API key from the ANTHROPIC_API_KEY env var, fall
back to the template text on any error, and cache results. Add a flag in config.py.
```

### A8. Hybrid recommendations
```
Once events.db has interactions, add item-item collaborative filtering:
"users who test-drove X also test-drove Y". Blend it into the score with a small weight
that only activates when a vehicle has at least 20 interactions. Add an offline
time-split evaluation on real events comparing content-only vs hybrid.
```

### A9. Production hardening
```
Add: Dockerfile and docker-compose (app + Postgres), move events from SQLite to Postgres
behind the same EventStore interface, ruff + mypy config, and a GitHub Actions workflow
that runs lint, type-check, pytest and fails if NDCG@10 from scripts.evaluate drops more
than 2 points below the main branch.
```

### A10. Migrate the UI to React (when the product needs it)
```
Plan a migration of static/ to a React + TypeScript + Vite app in frontend/, keeping the
same API contract. Show the plan and component tree first.
```

---

## Track B — Build it from scratch with Claude Code

Start in an empty folder with `claude`, then run these phases in order. After each one:
run the checkpoint, then ask Claude to commit.

| # | Prompt to give Claude Code | Checkpoint |
|---|---|---|
| B1 | "Create a Python project for a content-based vehicle recommender: venv instructions, requirements.txt (fastapi, uvicorn, pydantic, pandas, numpy, scikit-learn, pytest, httpx), folders app/, static/, data/, scripts/, tests/, docs/, and a CLAUDE.md describing commands and conventions." | Folder structure exists |
| B2 | "Create data/vehicles.csv with ~45 Indian-market cars: id, make, model, variant, body_type, fuel, transmission, price_lakh, power_bhp, seats, boot_litres, safety_rating, mileage_kmpl, range_km, features (pipe-separated). Mark it as sample data." | CSV loads in pandas |
| B3 | "Write app/config.py with vocabularies and all tunable weights, and app/features.py with a FeatureEncoder: one-hot body/fuel/transmission group, multi-hot features, min-max numerics, group weights. Same encoder must encode user preferences. Add tests." | `pytest` passes, vector dim correct |
| B4 | "Write app/recommender.py: hard filters (budget +10%, seats, strict fuel/transmission), cosine similarity, gaussian budget fit, final weighted score, MMR re-ranking. Add tests that the top result matches clear preferences." | Top-5 for a sample query looks right |
| B5 | "Write app/explainer.py: reasons and warnings from facts, ordered by per-group cosine contribution. Every result must have at least one reason; missing must-haves become warnings." | Each result is explained |
| B6 | "Write app/events.py with a SQLite events table and metrics(): CTR, test-drive rate, lead conversion, CSAT, CTR by position. Add implicit profile: recency-decayed, event-weighted average of interacted vehicle vectors blended with explicit preferences via alpha." | Implicit-profile test passes |
| B7 | "Write app/main.py (FastAPI) with /api/health, /api/options, /api/vehicles, /api/recommend (logs impressions), /api/events, /api/metrics, serving static/index.html. Use a create_app(db_path) factory and add API tests." | `/docs` works, tests pass |
| B8 | "Build static/index.html, styles.css, app.js: preference form with chips, ranked cards with match %, reasons, warnings, Save/Compare/Book test drive/👍👎 buttons that log events, and a Metrics dialog. No build step." | Full flow works in the browser |
| B9 | "Write scripts/evaluate.py (synthetic users, P@5, R@10, NDCG@10, coverage vs random and closest-price baselines) and scripts/simulate_traffic.py." | Content-based beats baselines |
| B10 | "Write docs: TECH_STACK, ARCHITECTURE, RECOMMENDER_ALGORITHM, DATA_MODEL, API, METRICS_AND_EVALUATION, ROADMAP." | Docs match the code |

This repo is the finished result of B1–B10, so you can compare against it at any step.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: app` | Run commands from the project root; tests use `pytest.ini` → `pythonpath = .` |
| Port 8000 busy | `uvicorn app.main:app --reload --port 8001` |
| Metrics all zero | Use the UI or run `python -m scripts.simulate_traffic` |
| Results look odd after editing the CSV | Feature keys must match `config.FEATURES` exactly; restart the server |
| Want a clean slate | Delete `data/events.db` |
| Claude Code drifted off-task | `/clear`, then restate the goal and point it at CLAUDE.md |
