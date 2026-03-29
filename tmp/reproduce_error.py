import sys
import os
import traceback

# Add the backend folder to sys.path so 'app' is importable
backend_dir = os.path.join(os.getcwd(), "backend")
if os.path.exists(backend_dir):
    sys.path.append(backend_dir)
else:
    # Fallback
    sys.path.append(os.getcwd())

# CRITICAL: We need to make sure 'app' is the package name
# If we are in 'backend', 'app' is a subfolder.
# So 'import app' works if sys.path has 'backend'.

try:
    from app.database import SessionLocal
    from app.services.problem_service import problem_service
    from app.services.submission_service import get_submission_service
    from app.models.problem import Problem
    from app.models.user import User
except ImportError as e:
    print(f"IMPORT ERROR: {e}")
    print(f"sys.path: {sys.path}")
    sys.exit(1)

def test_services():
    with SessionLocal() as db:
        print("--- Testing ProblemService.get_problem_bundle ---")
        try:
            # Test with slug 'divisible-sum-01'
            problem = db.query(Problem).filter(Problem.slug == 'divisible-sum-01').first()
            if problem:
                print(f"Found problem: {problem.id}")
                res = problem_service.get_problem_bundle(db, 'divisible-sum-01')
                print("Success")
            else:
                print("Problem 'divisible-sum-01' not found, skipping get_problem_bundle test")
        except Exception:
            print("CAUGHT EXPECTED/UNEXPECTED ERROR in get_problem_bundle:")
            traceback.print_exc()

        print("\n--- Testing User relationship access (UserStats & UserRating) ---")
        try:
            user = db.query(User).first()
            if user:
                print(f"Found user: {user.username} (ID: {user.id})")
                print("Checking user.stats...")
                print(f"Stats: {user.stats}")
                if hasattr(user, 'rating_row'):
                    print("Checking user.rating_row (backref from UserRating)...")
                    print(f"Rating Row: {user.rating_row}")
                print("Success")
            else:
                print("No user found in DB, skipping user test")
        except Exception:
            print("CAUGHT ERROR in User relationship access:")
            traceback.print_exc()

if __name__ == "__main__":
    test_services()
