# Metrics and Evaluation

## Business success metrics (online)

| Metric | Definition (as implemented in `/api/metrics`) | Why it matters |
|---|---|---|
| **Recommendation CTR** | clicks on recommended vehicles ÷ impressions | Are results relevant enough to engage? |
| **Test-drive rate** | users who booked ≥1 test drive ÷ users shown recommendations | Strongest in-app intent signal (a lead) |
| **Lead conversion rate** | purchases ÷ test-drive bookings | Did recommendations produce real sales? |
| **CSAT** | 👍 ÷ all feedback responses | Perceived quality of recommendations |
| **CTR by position** | CTR at rank 1…10 | Ranking quality; also measures position bias |

Supporting metrics to add: time-to-first-test-drive, saves per session, catalog coverage,
share of results with warnings, zero-result rate.

## Offline evaluation (before shipping a change)
`python -m scripts.evaluate --users 500`

Synthetic users have hidden "true" preferences; the recommender sees an incomplete, noisy
version. Ground truth = top 5 vehicles by hidden utility within budget.

Prototype results (500 synthetic users, seed 7):

| System | P@5 | R@10 | NDCG@10 |
|---|---|---|---|
| **Content-based (ours)** | **0.747** | **0.953** | **0.913** |
| Closest price in budget | 0.351 | 0.700 | 0.542 |
| Random within budget | 0.238 | 0.443 | 0.355 |

Synthetic results show the pipeline works, not real-world quality. Once you have traffic,
switch to **time-split evaluation on real logs**: train the implicit profile on events
before date T, check whether items users engaged with after T appear in the top-k.

## Online A/B testing
1. Randomly assign users to control (current ranking) vs treatment (change); store the
   assignment and log it with every `recommendation_id`.
2. Pre-register the primary metric (e.g. test-drive rate) and guardrails (CSAT, zero-result rate).
3. Estimate sample size up front (baseline rate, minimum detectable effect, 80% power).
4. Run at least 1–2 full weeks to cover weekday/weekend behaviour.
5. Ship only if the primary metric improves significantly without harming guardrails.

## Instrumentation checklist
- [x] Impressions logged with `recommendation_id` and position
- [x] Clicks, saves, compares, test drives, feedback logged from the UI
- [ ] Purchases pushed from CRM/DMS with the originating `recommendation_id`
- [ ] Experiment assignment and model version stored per request
- [ ] Dashboards with daily trends and per-segment breakdown (budget band, body type)
