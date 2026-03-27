import os
import sys

sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.models.submission import UserStats
from sqlalchemy import inspect

def check_user_stats():
    db = SessionLocal()
    try:
        inspector = inspect(db.get_bind())
        columns = inspector.get_columns('user_stats')
        print("Columns in 'user_stats':")
        for col in columns:
            print(f"  - {col['name']} ({col['type']})")
        
        stat = db.query(UserStats).first()
        if stat:
            print(f"\nExample stats for user_id={stat.user_id}:")
            fields = ['solved_count', 'easy_solved', 'medium_solved', 'hard_solved', 'rating']
            for field in fields:
                print(f"  {field}: {getattr(stat, field, 'MISSING')}")
        else:
            print("\nNo user_stats records found.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_user_stats()
