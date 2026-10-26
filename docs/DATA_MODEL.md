# Data Model

## Vehicle catalog — `data/vehicles.csv`

| Column | Type | Example | Notes |
|---|---|---|---|
| id | int | 17 | Unique, stable |
| make | str | Tata | |
| model | str | Nexon | |
| variant | str | Fearless+ S | Recommend at variant level: features differ by trim |
| body_type | enum | compact_suv | hatchback, sedan, micro_suv, compact_suv, midsize_suv, large_suv, mpv |
| fuel | enum | petrol | petrol, diesel, cng, hybrid, electric |
| transmission | enum | dct | manual, amt, cvt, dct, automatic (grouped to manual/automatic) |
| price_lakh | float | 13.0 | Ex-showroom, ₹ lakh |
| power_bhp | float | 118 | |
| seats | int | 5 | |
| boot_litres | float | 382 | |
| safety_rating | int 0–5 | 5 | 0 = not rated |
| mileage_kmpl | float | 17.4 | Empty for EVs; km/kg for CNG |
| range_km | float | 489 | EVs only |
| features | pipe list | sunroof\|adas | Keys must exist in `config.FEATURES` |

> Sample data is illustrative. Replace with a verified, regularly refreshed catalog
> (OEM feeds, dealer DMS, or a licensed data provider) before real use.

### Adding a new attribute
1. Add the column to the CSV.
2. Register vocabulary/weight in `app/config.py`.
3. Encode it in `FeatureEncoder.encode_vehicle` and `encode_preferences`.
4. Add a reason/warning in `app/explainer.py`.
5. Add tests, run `pytest` and `python -m scripts.evaluate`.

## Events — SQLite table `events`

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| user_id | text | Anonymous ID now; customer ID later |
| vehicle_id | int | Nullable |
| event_type | text | impression, click, save, compare, test_drive, purchase, feedback |
| recommendation_id | text | Links events to the list that produced them |
| position | int | Rank shown (1 = top) |
| value | real | feedback: 1 = 👍, 0 = 👎 |
| ts | real | Unix timestamp |

### Event semantics
| Event | Logged by | Meaning |
|---|---|---|
| impression | API | Vehicle shown in a ranked list |
| click | UI | User opened / engaged with a card |
| save, compare | UI | Strong interest |
| test_drive | UI | Test drive booked = **lead created** |
| purchase | CRM / dealer system | Lead converted to sale |
| feedback | UI | Thumbs up/down on a recommendation (CSAT) |

## Production schema (suggested)
`vehicles`, `variants`, `variant_features`, `prices` (by city, with history),
`users`, `sessions`, `events` (partitioned by date), `recommendation_logs`
(request, model version, results) and `experiments` (user → variant assignment).
