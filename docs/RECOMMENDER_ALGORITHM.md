# Recommender Algorithm (Content-Based Filtering)

## 1. Vehicle feature vector

Layout (28 dimensions with the sample vocabulary):

| Block | Encoding | Size | Group weight |
|---|---|---|---|
| body_type | one-hot | 7 | 2.0 |
| fuel | one-hot | 5 | 1.5 |
| transmission | one-hot (manual / automatic) | 2 | 1.5 |
| features | multi-hot (sunroof, ADAS, …) | 10 | 1.0 |
| numeric | min-max scaled power, seats, boot, safety | 4 | 1.0 |

Each block is multiplied by its weight (`config.GROUP_WEIGHTS`), then rows are L2-normalised.
Price is **not** in the vector — it is handled by the hard filter and `budget_fit`, because
"closer in price" is not the same as "similar".

## 2. User profile vector

**Explicit** (from the form), in the same layout:
- Multi-select categories share weight: picking 2 body types sets each to 0.5.
- Empty choice = zeros = neutral (that block doesn't affect ranking).
- Must-have features = 1.
- Priorities switch on numeric dims: safety → safety_rating, performance → power, space → boot.
- 7 seats needed → seats dim set to the scaled value.

**Implicit** (from behaviour):

```
implicit = Σ w_e · decay(age) · vehicle_vec  /  Σ w_e · decay(age)
w_e:   click 1, save 2, compare 3, test_drive 5, purchase 6
decay: 0.5 ^ (age_days / 7)
```

**Blend:**
```
profile = α · explicit + (1 − α) · implicit
α = 0.85 for a new user, falling linearly to 0.55 after 15 interactions
α = 0 if the user gave no explicit preferences
```

## 3. Hard filters
- `price ≤ budget_max × 1.10`
- `seats ≥ min_seats` (if given)
- `fuel ∈ fuels` only if `fuel_strict`
- `transmission_group == transmission` only if `transmission_strict`

## 4. Scoring
```
similarity = cos(profile, vehicle)
budget_fit = exp(−(over/w)²) · exp(−(under/2w)²),   w = 0.15 · budget_max
             (1.0 anywhere inside [budget_min, budget_max])
popularity = weighted engagement count, normalised to [0, 1]

score = 0.70·similarity + 0.25·budget_fit + 0.05·popularity  [+ 0.10·efficiency]
match_pct = score / max_possible_score
```

## 5. Diversity: Maximal Marginal Relevance
```
next = argmax_i  λ·score_i − (1 − λ)·max_{j∈selected} cos(v_i, v_j),   λ = 0.85
```
Stops the top 10 being five trims of one model.

## 6. Explanations
Cosine similarity is a sum over dimensions, so it splits exactly into per-group parts:
```
contrib_g = (u_g · v_g) / (‖u‖‖v‖)
```
Reasons are generated from facts (budget, body, fuel, transmission, must-haves, priorities,
"similar to the X you test-drove") and sorted by `contrib_g`. Unmet preferences become
**warnings** ("Missing: ADAS", "12% above your max budget") — showing trade-offs builds trust.

## 7. Tuning workflow
1. Change a number in `app/config.py`.
2. `python -m scripts.evaluate --users 1000` → compare P@5 / NDCG@10 / coverage.
3. If better offline, A/B test online (see METRICS_AND_EVALUATION.md).
