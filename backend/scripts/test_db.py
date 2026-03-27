from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

def main():
    print("=== Database Connection Test ===")
    load_dotenv()

    # Check if DATABASE_URL is set
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set!")
        print("Please set DATABASE_URL in your .env file.")
        sys.exit(1)

    print(f"Testing database connection with URL: {db_url}")

    try:
        engine = create_engine(db_url)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        print("✓ Database connection is working!")
    except OperationalError as e:
        print(f"✗ Database connection failed: {e}")
        print("Please check your database server status and credentials.")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected database error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
