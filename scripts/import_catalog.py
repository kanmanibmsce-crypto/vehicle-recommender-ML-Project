"""Import vehicles from toyota_vehicles_catalog.xlsx (sheet: Catalog) into data/vehicles.csv.

Usage:
    python -m scripts.import_catalog
    python -m scripts.import_catalog --dry-run
"""
import argparse
import shutil
import sys
from pathlib import Path

import pandas as pd

# Allow running as a module from the project root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import BODY_TYPES, FUELS, FEATURES  # noqa: E402

CATALOG_PATH = ROOT / "toyota_vehicles_catalog.xlsx"
CATALOG_SHEET = "Catalog"
CATALOG_HEADER_ROW = 1          # row index (0-based) that holds the real column names

VEHICLES_CSV = ROOT / "data" / "vehicles.csv"
BACKUP_CSV = ROOT / "data" / "vehicles.csv.bak"

# Transmissions accepted in the raw catalog (amt/cvt/dct all map to "automatic" at query time)
VALID_TRANSMISSIONS = {"manual", "amt", "cvt", "dct", "automatic"}

# Feature columns in the Excel that map 1-to-1 to config.FEATURES
FEATURE_COLS = list(FEATURES)

OUTPUT_COLS = [
    "id", "make", "model", "variant", "body_type", "fuel", "transmission",
    "price_lakh", "power_bhp", "seats", "boot_litres", "safety_rating",
    "mileage_kmpl", "range_km", "features",
]


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _nonempty(val) -> bool:
    return isinstance(val, str) and val.strip() != ""


def _pos_float(val) -> bool:
    try:
        return float(val) > 0
    except (TypeError, ValueError):
        return False


def _nonneg_float(val) -> bool:
    try:
        return float(val) >= 0
    except (TypeError, ValueError):
        return False


def validate_row(row: pd.Series) -> list[str]:
    """Return a list of validation error strings. Empty list means the row is valid."""
    errors: list[str] = []

    if not _nonempty(row.get("make")):
        errors.append("make is blank")
    if not _nonempty(row.get("model")):
        errors.append("model is blank")
    if not _nonempty(row.get("variant")):
        errors.append("variant is blank")

    body = str(row.get("body_type", "")).strip().lower()
    if body not in BODY_TYPES:
        errors.append(f"body_type '{body}' not in allowed list ({', '.join(BODY_TYPES)})")

    fuel = str(row.get("fuel", "")).strip().lower()
    if fuel not in FUELS:
        errors.append(f"fuel '{fuel}' not in allowed list ({', '.join(FUELS)})")

    tx = str(row.get("transmission", "")).strip().lower()
    if tx not in VALID_TRANSMISSIONS:
        errors.append(f"transmission '{tx}' not in allowed list ({', '.join(sorted(VALID_TRANSMISSIONS))})")

    if not _pos_float(row.get("price_lakh")):
        errors.append("price_lakh must be a positive number")

    if not _pos_float(row.get("power_bhp")):
        errors.append("power_bhp must be a positive number")

    try:
        seats = int(float(row.get("seats", 0)))
        if seats < 2:
            errors.append("seats must be >= 2")
    except (TypeError, ValueError):
        errors.append("seats must be a number")

    sr = row.get("safety_rating")
    if pd.notna(sr) and sr != "":
        try:
            if not (0 <= float(sr) <= 5):
                errors.append(f"safety_rating {sr} must be 0–5")
        except (TypeError, ValueError):
            errors.append(f"safety_rating '{sr}' is not a number")

    kmpl = row.get("mileage_kmpl")
    if pd.notna(kmpl) and kmpl != "":
        if not _pos_float(kmpl):
            errors.append(f"mileage_kmpl '{kmpl}' must be a positive number when present")

    range_km = row.get("range_km")
    if fuel == "electric":
        if pd.isna(range_km) or range_km == "" or not _pos_float(range_km):
            errors.append("range_km is required and must be positive for electric vehicles")
    elif pd.notna(range_km) and range_km != "":
        if not _pos_float(range_km):
            errors.append(f"range_km '{range_km}' must be a positive number when present")

    return errors


# ---------------------------------------------------------------------------
# Feature column → pipe-separated string
# ---------------------------------------------------------------------------

def build_features(row: pd.Series) -> str:
    active = []
    for col in FEATURE_COLS:
        val = row.get(col, "")
        if isinstance(val, str) and val.strip().lower() == "yes":
            active.append(col)
    return "|".join(active)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(dry_run: bool = False) -> None:
    # 1. Read the catalog
    print(f"Reading: {CATALOG_PATH}  (sheet: {CATALOG_SHEET})")
    df = pd.read_excel(
        CATALOG_PATH,
        sheet_name=CATALOG_SHEET,
        header=CATALOG_HEADER_ROW,
    )
    print(f"  {len(df)} rows found in catalog\n")

    # 2. Validate each row
    good_rows: list[dict] = []
    skip_log: list[tuple[int, str, list[str]]] = []   # (excel_row, label, errors)

    for i, row in df.iterrows():
        excel_row = i + CATALOG_HEADER_ROW + 2   # +2: 1-based + header offset
        label = f"{row.get('make', '?')} {row.get('model', '?')}"
        errors = validate_row(row)

        if errors:
            skip_log.append((excel_row, label, errors))
            continue

        good_rows.append(row)

    # 3. Determine starting ID
    if VEHICLES_CSV.exists():
        existing = pd.read_csv(VEHICLES_CSV)
        next_id = int(existing["id"].max()) + 1 if len(existing) else 1
    else:
        existing = pd.DataFrame(columns=OUTPUT_COLS)
        next_id = 1

    # 4. Build output rows
    new_records: list[dict] = []
    for offset, row in enumerate(good_rows):
        r: dict = {}
        r["id"] = next_id + offset
        r["make"] = str(row["make"]).strip()
        r["model"] = str(row["model"]).strip()
        r["variant"] = str(row["variant"]).strip()
        r["body_type"] = str(row["body_type"]).strip().lower()
        r["fuel"] = str(row["fuel"]).strip().lower()
        r["transmission"] = str(row["transmission"]).strip().lower()
        r["price_lakh"] = float(row["price_lakh"])
        r["power_bhp"] = float(row["power_bhp"])
        r["seats"] = int(float(row["seats"]))
        r["boot_litres"] = float(row["boot_litres"]) if pd.notna(row.get("boot_litres")) else ""
        r["safety_rating"] = int(float(row["safety_rating"])) if pd.notna(row.get("safety_rating")) else ""
        r["mileage_kmpl"] = float(row["mileage_kmpl"]) if pd.notna(row.get("mileage_kmpl")) else ""
        r["range_km"] = float(row["range_km"]) if pd.notna(row.get("range_km")) else ""
        r["features"] = build_features(row)
        new_records.append(r)

    # 5. Print summary
    print(f"Imported : {len(new_records)}")
    print(f"Skipped  : {len(skip_log)}")
    for excel_row, label, errors in skip_log:
        for err in errors:
            print(f"  Row {excel_row:<3} — {label}: {err}")

    if not new_records:
        print("\nNothing to write.")
        return

    if dry_run:
        print("\n[dry-run] No files written.")
        new_df = pd.DataFrame(new_records, columns=OUTPUT_COLS)
        print(new_df.to_string(index=False))
        return

    # 6. Back up current CSV
    if VEHICLES_CSV.exists():
        shutil.copy2(VEHICLES_CSV, BACKUP_CSV)
        print(f"\nBacked up existing catalog -> {BACKUP_CSV}")

    # 7. Append and write
    new_df = pd.DataFrame(new_records, columns=OUTPUT_COLS)
    combined = pd.concat([existing, new_df], ignore_index=True)
    combined.to_csv(VEHICLES_CSV, index=False)
    print(f"Written  : {VEHICLES_CSV}  ({len(combined)} total rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Toyota catalog into vehicles.csv")
    parser.add_argument("--dry-run", action="store_true", help="Validate and preview without writing")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
