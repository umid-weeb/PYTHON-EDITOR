import sys
import os
from sqlalchemy import text

# Add the backend folder to sys.path so we can import from 'app'
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
        print("Checking for duplicate UserStats...")
        rows = db.execute(text("SELECT user_id, COUNT(*) FROM user_stats GROUP BY user_id HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"Duplicate UserStats found for user_id={r[0]}: {r[1]} rows")
            
        print("\nChecking for duplicate UserRatings...")
        rows = db.execute(text("SELECT user_id, COUNT(*) FROM user_ratings GROUP BY user_id HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"Duplicate UserRatings found for user_id={r[0]}: {r[1]} rows")

        print("\nChecking for duplicate SolvedProblems...")
        rows = db.execute(text("SELECT user_id, problem_id, COUNT(*) FROM solved_problems GROUP BY user_id, problem_id HAVING COUNT(*) > 1")).all()
        for r in rows:
            print(f"Duplicate SolvedProblem found for user_id={r[0]}, problem_id={r[1]}: {r[2]} rows")

if __name__ == "__main__":
    audit_duplicates()
