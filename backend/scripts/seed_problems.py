from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

REPO_ROOT = BACKEND_ROOT.parent


def _load_env_files() -> None:
    """Load project env files before importing database modules."""

    for env_file in (REPO_ROOT / ".env", BACKEND_ROOT / ".env"):
        if env_file.exists():
            load_dotenv(env_file, override=False)

    load_dotenv(override=False)


def _require_database_url(*, allow_sqlite: bool) -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        if allow_sqlite:
            return ""
        raise SystemExit(
            "DATABASE_URL is required to seed the production catalog. "
            "Set it to your Supabase/PostgreSQL connection string or pass "
            "--allow-sqlite for local development."
        )

    if database_url.startswith("sqlite") and not allow_sqlite:
        raise SystemExit(
            "Refusing to seed SQLite in production mode. "
            "Set DATABASE_URL to your Supabase/PostgreSQL connection string "
            "or pass --allow-sqlite for local development."
        )

    return database_url


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the default Pyzone Arena problem catalog.")
    parser.add_argument("--force", action="store_true", help="Delete existing problems before inserting the default catalog.")
    parser.add_argument(
        "--database-url",
        help="Explicit DATABASE_URL override for this run.",
    )
    parser.add_argument(
        "--allow-sqlite",
        action="store_true",
        help="Allow SQLite seeding for local development only.",
    )
    args = parser.parse_args()

    _load_env_files()
    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url
    _require_database_url(allow_sqlite=args.allow_sqlite)

    from app import models as _models  # noqa: F401
    from app.database import Base, SessionLocal, engine
    from app.services.problem_catalog import seed_problem_catalog
    from app.services.sql_problem_catalog import seed_sql_problem_catalog

    Base.metadata.create_all(bind=engine)

    print(f"Seeding problems using {engine.dialect.name} database...")
    with SessionLocal() as db:
        summary = seed_problem_catalog(db, force=args.force)
        sql_summary = seed_sql_problem_catalog(db, force=args.force)

    total_ready = summary.total_count + sql_summary.total_count
    print(f"{total_ready} problems ready.")
    print(
        f"Seeded {summary.inserted_count} base problems and {sql_summary.inserted_count} SQL problems, "
        f"skipped {summary.skipped_count + sql_summary.skipped_count}, total catalog size {total_ready}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
