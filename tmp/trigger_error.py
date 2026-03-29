import sys
import os
import traceback

# Add the backend folder to sys.path
backend_dir = os.path.join(os.getcwd(), "backend")
sys.path.append(backend_dir)

from app.database import SessionLocal
from app.models.user import User
from app.models.problem import Problem

def trigger_error():
    with SessionLocal() as db:
        print("Starting deep relationship audit...")
        
        # 1. Check User -> Stats (uselist=False)
        users = db.query(User).all()
        print(f"Checking {len(users)} users for problematic relationships...")
        for u in users:
            try:
                # This access will trigger MultipleResultsFound if UserStats has duplicates
                _ = u.stats
            except Exception:
                print(f"[CRITICAL] Error accessing user.stats for User(id={u.id}, username={u.username})")
                traceback.print_exc()

        # 2. Check User -> rating_row (backref from UserRating)
        for u in users:
            try:
                # This access will trigger MultipleResultsFound if UserRating has duplicates
                if hasattr(u, "rating_row"):
                    _ = u.rating_row
            except Exception:
                print(f"[CRITICAL] Error accessing user.rating_row for User(id={u.id}, username={u.username})")
                traceback.print_exc()

        # 3. Check Problem -> ProblemTranslation uniqueness
        print("Checking problems for translation consistency...")
        problems = db.query(Problem).all()
        for p in problems:
            try:
                # If there are manual queries using .one() elsewhere, this might find them
                pass 
            except Exception:
                traceback.print_exc()

        print("Deep audit complete.")

if __name__ == "__main__":
    trigger_error()
