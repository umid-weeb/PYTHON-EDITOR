import sys
import os
from sqlalchemy import text

# Add the backend directory to sys.path so we can import 'app'
backend_dir = os.path.join(os.getcwd(), "backend")
if os.path.exists(backend_dir):
    sys.path.append(backend_dir)
else:
    # Fallback if already in backend
    sys.path.append(os.getcwd())

try:
    from app.database import SessionLocal
except ImportError as e:
    print(f"FAILED TO IMPORT: {e}")
    print(f"Current sys.path: {sys.path}")
    sys.exit(1)

def audit_duplicates():
    with SessionLocal() as db:
        print("Auditing tables for potential MultipleResultsFound causes...")
        
        # 1. UserStats
        print("\nChecking UserStats for duplicate user_id...")
        rows = db.execute(text("SELECT user_id, COUNT(*) FROM user_stats GROUP BY user_id HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"  [ERROR] user_id={r[0]} has {r[1]} rows in user_stats!")
            
        # 2. Problems by Slug
        print("\nChecking Problems for duplicate slugs...")
        rows = db.execute(text("SELECT slug, COUNT(*) FROM problems GROUP BY slug HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"  [ERROR] slug='{r[0]}' is present {r[1]} times!")

        # 3. SolvedProblems
        print("\nChecking SolvedProblems for duplicate (user_id, problem_id)...")
        rows = db.execute(text("SELECT user_id, problem_id, COUNT(*) FROM solved_problems GROUP BY user_id, problem_id HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"  [ERROR] user_id={r[0]}, problem_id='{r[1]}' has {r[2]} rows in solved_problems!")

        # 4. ProblemTranslations
        print("\nChecking ProblemTranslations for duplicate (problem_id, language_code)...")
        rows = db.execute(text("SELECT problem_id, language_code, COUNT(*) FROM problem_translations GROUP BY problem_id, language_code HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"  [ERROR] problem_id='{r[0]}', lang='{r[1]}' has {r[2]} rows!")

        print("\nAudit complete.")

if __name__ == "__main__":
    audit_duplicates()
