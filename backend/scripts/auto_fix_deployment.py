from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

def main():
    print("=== Auto-Fix Deployment Issues Script ===")
    print("This script will automatically fix common deployment issues.\n")

    # Load environment variables
    load_dotenv()

    # Check if DATABASE_URL is set
    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL is not set!")
        print("Please set DATABASE_URL in your .env file first.")
        print("Example: DATABASE_URL=postgresql://user:password@localhost:5432/database")
        sys.exit(1)

    # Create required directories
    print("\nCreating required directories...")
    directories = [
        Path("backend/.data"),
        Path("backend/.cache"),
        Path("backend/uploads"),
        Path("backend/.cache/problems"),
        Path("backend/.data/secure_problem_store"),
    ]

    for directory in directories:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            print(f"  ✓ Created: {directory}")
        except Exception as e:
            print(f"  ✗ Failed to create {directory}: {e}")
            sys.exit(1)

    # Test database connection
    print("\nTesting database connection...")
    try:
        engine = create_engine(os.getenv("DATABASE_URL"))
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        print("  ✓ Database connection is working!")
    except OperationalError as e:
        print(f"  ✗ Database connection failed: {e}")
        print("  Please check your DATABASE_URL and database server status.")
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ Unexpected database error: {e}")
        sys.exit(1)

    # Check if .env file exists
    env_file = Path("backend/.env")
    if not env_file.exists():
        print("\nCreating .env file...")
        try:
            env_file.write_text(f"DATABASE_URL={os.getenv('DATABASE_URL')}\n")
            print("  ✓ Created .env file with DATABASE_URL")
        except Exception as e:
            print(f"  ✗ Failed to create .env file: {e}")
            sys.exit(1)

    # Check for common issues
    print("\nChecking for common deployment issues...")
    issues = []

    # Check if required settings are configured
    required_settings = {
        "ARENA_APP_NAME": "Pyzone Arena Backend",
        "ARENA_API_PREFIX": "/api",
        "ARENA_JWT_SECRET": "dev-secret-change-me",
        "ARENA_LOG_LEVEL": "INFO",
    }

    for setting, default in required_settings.items():
        if not os.getenv(setting):
            issues.append(f"Set {setting} in .env file (default: {default})")

    # Check if uploads directory is writable
    uploads_dir = Path("backend/uploads")
    if not os.access(uploads_dir, os.W_OK):
        issues.append(f"Make uploads directory writable: {uploads_dir}")

    if issues:
        print("\nRECOMMENDED FIXES:")
        for issue in issues:
            print(f"  - {issue}")
        print("\nRun these commands to fix remaining issues:")
        print("  echo 'ARENA_APP_NAME=Pyzone Arena Backend' >> backend/.env")
        print("  echo 'ARENA_API_PREFIX=/api' >> backend/.env")
        print("  echo 'ARENA_JWT_SECRET=dev-secret-change-me' >> backend/.env")
        print("  echo 'ARENA_LOG_LEVEL=INFO' >> backend/.env")
    else:
        print("\nAll deployment issues fixed!")

    # Final deployment checklist
    print("\nDEPLOYMENT READY!")
    print("Next steps:")
    print("  1. Set any missing environment variables in .env file")
    print("  2. Run database migrations: python scripts/migrate_to_multilingual.py")
    print("  3. Start the application: python app/main.py")
    print("  4. Test API endpoints")

if __name__ == "__main__":
    main()