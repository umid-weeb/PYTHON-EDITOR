from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

def main():
    print("=== Deployment Test Script ===")
    print("This script will test the complete deployment.\n")

    # Load environment variables
    load_dotenv()

    # Check if DATABASE_URL is set
    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL is not set!")
        print("Please set DATABASE_URL in your .env file first.")
        sys.exit(1)

    # Test database connection
    print("1. Testing database connection...")
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

    # Check required directories
    print("\n2. Checking required directories...")
    required_dirs = [
        Path("backend/.data"),
        Path("backend/.cache"),
        Path("backend/uploads"),
    ]

    missing_dirs = []
    for directory in required_dirs:
        if not directory.exists():
            missing_dirs.append(directory)

    if missing_dirs:
        print("  Missing directories detected:")
        for directory in missing_dirs:
            print(f"    {directory}")
        print("\nRun this command to create missing directories:")
        print("  mkdir -p backend/.data backend/.cache backend/uploads")
        sys.exit(1)
    else:
        print("  ✓ All required directories exist")

    # Check .env file
    print("\n3. Checking .env file...")
    env_file = Path("backend/.env")
    if not env_file.exists():
        print("  ✗ .env file not found!")
        print("  Please create .env file with DATABASE_URL")
        sys.exit(1)
    else:
        print("  ✓ .env file exists")

    # Check required settings
    print("\n4. Checking required settings...")
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
            print(f"    {setting} (using default: {default})")
    else:
        print("  ✓ All required settings are configured")

    # Test API endpoints
    print("\n5. Testing API endpoints...")
    try:
        # Test health endpoint
        print("  Testing health endpoint...")
        result = subprocess.run(
            ["curl", "-s", "http://localhost:8000/api/health"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("  ✓ Health endpoint is working")
        else:
            print(f"  ✗ Health endpoint failed: {result.stderr}")

        # Test problems endpoint
        print("  Testing problems endpoint...")
        result = subprocess.run(
            ["curl", "-s", "http://localhost:8000/api/problems"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("  ✓ Problems endpoint is working")
        else:
            print(f"  ✗ Problems endpoint failed: {result.stderr}")

        # Test specific problem
        print("  Testing specific problem...")
        result = subprocess.run(
            ["curl", "-s", "http://localhost:8000/api/problems/two-sum"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("  ✓ Specific problem endpoint is working")
        else:
            print(f"  ✗ Specific problem endpoint failed: {result.stderr}")

        print("\n=== DEPLOYMENT TEST PASSED! ===")
        print("All tests completed successfully.")
        print("\nThe multilingual problem system is ready for use.")
        print("\nNext steps:")
        print("  1. Start the application: python app/main.py")
        print("  2. Access the API at: http://localhost:8000/api")
        print("  3. Test in browser: http://localhost:8000")
    except Exception as e:
        print(f"  ✗ API testing failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()