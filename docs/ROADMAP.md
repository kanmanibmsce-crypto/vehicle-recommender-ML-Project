# Roadmap

## Phase 1 — Prototype ✅ (this repo)
Content-based ranking, hard filters, budget fit, MMR, explanations, event logging,
metrics endpoint, web UI, tests, offline evaluation.

## Phase 2 — Real data & product polish
- Replace sample CSV with a verified catalog; add city-wise on-road prices.
- Vehicle detail page, side-by-side compare view, image support.
- Test-drive booking form (dealer, date, slot) and CRM integration for `purchase` events.
- Customer accounts with consent for personalisation.
- "Why not X?" — explain why a specific vehicle ranked lower.

## Phase 3 — Smarter content model
- Text features: TF-IDF / sentence embeddings over descriptions and expert reviews.
- Use-case tags (city commute, highway, family, off-road) mapped to attributes.
- Natural-language search ("automatic SUV under 15 lakh with sunroof") parsed into
  preferences with an LLM.
- LLM-polished explanations generated from the computed facts only.

## Phase 4 — Learning from behaviour
- Tune weights with offline eval + A/B tests.
- Hybrid recommender: add item-item collaborative filtering ("people who test-drove X
  also test-drove Y") once there are enough interactions.
- Learning-to-rank (LightGBM LambdaMART) on logged impressions → clicks/test drives,
  with position-bias correction.

## Phase 5 — Production
PostgreSQL + pgvector, Redis cache, Docker, CI (ruff, mypy, pytest, eval gate),
monitoring, React/Next.js frontend, experiment framework.
