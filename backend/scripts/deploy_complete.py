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
    print("=== Complete Deployment Script ===")
    print("This script will deploy the multilingual problem system.\n")

    # Load environment variables
    load_dotenv()

    # Step 1: Check DATABASE_URL
    print("1. Checking database configuration...")
    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL is not set!")
        print("Please set DATABASE_URL in your .env file first.")
        print("Example: DATABASE_URL=postgresql://user:password@localhost:5432/database")
        sys.exit(1)

# Add backend directory to Python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

    # Step 2: Create required directories
    print("\n2. Creating required directories...")
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

# Step 3: Test database connection
print("\n3. Testing database connection...")
try:
    from app.database import DATABASE_URL, engine, SessionLocal
    db = SessionLocal()
    db.execute(text("SELECT 1"))
    db.close()
    print("  ✓ Database connection is working!")
except OperationalError as e:
    print(f"  ✗ Database connection failed: {e}")
    print("  Please check your DATABASE_URL and database server status.")
    sys.exit(1)
except Exception as e:
    print(f"  ✗ Unexpected database error: {e}")
    sys.exit(1)

    # Step 4: Check .env file
    print("\n4. Checking .env file...")
    env_file = Path("backend/.env")
    if not env_file.exists():
        print("  Creating .env file...")
        try:
            env_file.write_text(f"DATABASE_URL={os.getenv('DATABASE_URL')}\n")
            print("  ✓ Created .env file with DATABASE_URL")
        except Exception as e:
            print(f"  ✗ Failed to create .env file: {e}")
            sys.exit(1)

    # Step 5: Check required settings
    print("\n5. Checking required settings...")
    required_settings = {
        "ARENA_APP_NAME": "Pyzone Arena Backend",
        "ARENA_API_PREFIX": "/api",
        "ARENA_JWT_SECRET": "dev-secret-change-me",
        "ARENA_LOG_LEVEL": "INFO",
    }

    missing_settings = []
    for setting, default in required_settings.items():
        if not os.getenv(setting):
            missing_settings.append(setting)

    if missing_settings:
        print("  Missing settings detected:")
        for setting in missing_settings:
            print(f"    {setting} (using default: {required_settings[setting]})")
    else:
        print("  ✓ All required settings are configured")

    # Step 6: Run database migrations
    print("\n6. Running database migrations...")
    try:
        from app.database import Base, engine
        Base.metadata.create_all(bind=engine)
        print("  ✓ Database schema created successfully")
    except Exception as e:
        print(f"  ✗ Failed to create database schema: {e}")
        sys.exit(1)

    # Step 7: Run data migration
    print("\n7. Running data migration...")
    try:
        import subprocess
        result = subprocess.run(
            ["python", "scripts/migrate_to_multilingual.py"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("  ✓ Data migration completed successfully")
        else:
            print(f"  ✗ Data migration failed: {result.stderr}")
            sys.exit(1)
    except Exception as e:
        print(f"  ✗ Failed to run data migration: {e}")
        sys.exit(1)

    # Step 8: Verify deployment
    print("\n8. Verifying deployment...")
    try:
        from app.services.problem_service import problem_service
        from app.services.submission_service import get_submission_service

        # Test problem service
        problem = problem_service.get_problem_by_slug("two-sum")
        if problem:
            print("  ✓ Problem service is working")
        else:
            print("  ✓ Problem service initialized (no test data)")

        # Test submission service
        submission_service = get_submission_service()
        print("  ✓ Submission service initialized")

        print("\n=== DEPLOYMENT SUCCESSFUL! ===")
        print("The multilingual problem system is now deployed and ready.")
        print("\nNext steps:")
        print("  1. Test API endpoints:")
        print("     curl http://localhost:8000/api/problems/two-sum")
        print("  2. Add more problems:")
        print("     python scripts/add_problem_with_translations.py interactive")
        print("  3. Run tests:")
        print("     python tests/test_multilingual_system.py all")
        print("\nYou can now start the application:")
        print("  python app/main.py")
        print("\nAccess the API at: http://localhost:8000/api")
    except Exception as e:
        print(f"  ✗ Verification failed: {e}")
        print("\nDeployment completed but verification failed. The system may still work.")
        print("Check the error above and try starting the application.")

if __name__ == "__main__":
    main()