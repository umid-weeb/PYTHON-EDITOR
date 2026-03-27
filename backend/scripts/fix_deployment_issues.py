from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

# Load environment variables
load_dotenv()

# Check if DATABASE_URL is set
if not os.getenv("DATABASE_URL"):
    print("ERROR: DATABASE_URL environment variable is not set!")
    print("Please set DATABASE_URL in your .env file or environment.")
    sys.exit(1)

# Check if required settings are configured
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
    print("WARNING: Missing required settings:")
    for setting in missing_settings:
        print(f"  {setting} (using default: {required_settings[setting]})")

# Test database connection
try:
    engine = create_engine(os.getenv("DATABASE_URL"))
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    db.execute("SELECT 1")
    db.close()
    print("SUCCESS: Database connection is working!")
except OperationalError as e:
    print(f"ERROR: Database connection failed: {e}")
    print("Please check your DATABASE_URL and database server status.")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: Unexpected database error: {e}")
    sys.exit(1)

# Check for common deployment issues
issues = []

# Check if .env file exists
if not Path("backend/.env").exists():
    issues.append("Create .env file with DATABASE_URL")

# Check if data directory exists
data_dir = Path("backend/.data")
if not data_dir.exists():
    issues.append(f"Create data directory: {data_dir}")

# Check if cache directory exists
cache_dir = Path("backend/.cache")
if not cache_dir.exists():
    issues.append(f"Create cache directory: {cache_dir}")

# Check if uploads directory exists
uploads_dir = Path("backend/uploads")
if not uploads_dir.exists():
    issues.append(f"Create uploads directory: {uploads_dir}")

if issues:
    print("\nRECOMMENDED FIXES:")
    for issue in issues:
        print(f"  - {issue}")
    print("\nRun these commands to fix deployment issues:")
    print("  mkdir -p backend/.data backend/.cache backend/uploads")
    print("  touch backend/.env")
    print("  echo 'DATABASE_URL=your_database_url_here' >> backend/.env")
else:
    print("\nAll deployment checks passed!")

# Final deployment checklist
print("\nDEPLOYMENT CHECKLIST:")
print("  [ ] Set DATABASE_URL in .env file")
print("  [ ] Create required directories (.data, .cache, uploads)")
print("  [ ] Configure required settings in config.py")
print("  [ ] Test database connection")
print("  [ ] Run database migrations")
print("  [ ] Start application")
print("  [ ] Test API endpoints")