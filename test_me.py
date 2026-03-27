import os
import sys
from datetime import datetime, timezone

sys.path.append(os.path.abspath('backend'))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv('backend/.env')

from app.database import SessionLocal, _sanitize_db_url
from app.models.user import User
from app.services.user_stats_service import user_stats_service
from app.repositories.submission_tracking import submission_tracking_repository

def test_me_logic(username):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"User {username} not found")
            return
        
        print(f"Testing /me for {user.username} (id={user.id})")
        
        print("1. ensure_user_stats_fresh")
        snapshot = user_stats_service.ensure_user_stats_fresh(db, user.id)
        print(f"   Snapshot: {snapshot}")
        
        print("2. get_problem_bank_totals")
        problem_bank = submission_tracking_repository.get_problem_bank_totals(db)
        print(f"   Problem Bank: {problem_bank}")
        
        print("3. rating_service.snapshot")
        from app.services.rating_service import rating_service
        rating = rating_service.snapshot(db, user.id)
        print(f"   Rating: {rating}")
        
        print("Success!")
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    # Assuming user 1 exists from previous tests or I'll try 'isroilov0705' or similar
    test_me_logic("isroilov0705")
