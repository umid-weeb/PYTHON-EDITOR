"""
One-off backfill: give every existing problem a signature spec + per-language
starter stubs (9 languages). Idempotent — safe to re-run; only fills what's
missing and never overwrites manually-edited (is_custom) rows.

Usage (from backend/):
    python -m scripts.backfill_starter_codes          # fill missing only
    python -m scripts.backfill_starter_codes --all    # regenerate all (keeps custom)
    python -m scripts.backfill_starter_codes --all --overwrite-custom
"""
from __future__ import annotations

import argparse
import sys

from app.database import SessionLocal
import app.models  # noqa: F401  (register models)
from app.services.starter_code_service import backfill_all, backfill_missing


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill per-language starter code")
    parser.add_argument("--all", action="store_true", help="regenerate every problem")
    parser.add_argument("--overwrite-custom", action="store_true", help="also overwrite is_custom rows")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.all:
            count = backfill_all(db, overwrite_custom=args.overwrite_custom)
            print(f"Regenerated starter codes for {count} problem(s).")
        else:
            count = backfill_missing(db)
            print(f"Filled missing starter codes for {count} problem(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
