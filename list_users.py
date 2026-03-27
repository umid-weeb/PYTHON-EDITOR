import os
import sys

sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.models.user import User
from sqlalchemy import select

def list_users():
    db = SessionLocal()
    try:
        users = db.query(User).limit(5).all()
        for u in users:
            print(f"ID: {u.id}, Username: {u.username}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    list_users()
