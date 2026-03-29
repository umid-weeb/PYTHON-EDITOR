import sys
import os
from datetime import datetime, timezone

# Add backend to path for imports
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.database import SessionLocal
    from app.models.problem import Problem, TestCase
    from sqlalchemy import func
except ImportError as e:
    print(f"[X] Import error: {e}")
    sys.exit(1)

def audit_problems():
    print("--- PyZone Arena: 120+ Problem Bank Audit ---")
    db = SessionLocal()
    try:
        # 1. Count Total Problems
        total = db.query(Problem).count()
        print(f"[*] Total Problems in DB: {total}")

        # 2. Check for Duplicate Slugs
        slug_counts = db.query(Problem.slug, func.count(Problem.id)).group_by(Problem.slug).having(func.count(Problem.id) > 1).all()
        if slug_counts:
            print(f"[!] WARNING: Found {len(slug_counts)} duplicate slugs:")
            for slug, count in slug_counts:
                print(f"    - '{slug}': {count} entries")
        else:
            print("[✓] No duplicate slugs found.")

        # 3. Check for Problems without Test Cases
        probs = db.query(Problem).all()
        no_tests = []
        for p in probs:
            tc_count = db.query(TestCase).filter(TestCase.problem_id == p.id).count()
            if tc_count == 0:
                no_tests.append(f"{p.slug} (ID: {p.id})")
        
        if no_tests:
            print(f"[!] WARNING: {len(no_tests)} problems have ZERO test cases:")
            for info in no_tests[:10]: # Limit output
                print(f"    - {info}")
            if len(no_tests) > 10:
                print(f"    ... and {len(no_tests)-10} more")
        else:
            print("[✓] All problems have at least one test case.")

        print("\n--- Summary ---")
        if slug_counts or no_tests:
            print("[!] Please address the warnings above to ensure all problems work reliably.")
        else:
            print("[✓] Your 120+ problem bank appears to be healthy!")

    except Exception as e:
        print(f"[X] Audit failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    audit_problems()
