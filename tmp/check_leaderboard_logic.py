from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import SessionLocal
from app.models.user import User
from app.models.rating import UserRating
from app.models.submission import UserStats

def check_leaderboard():
    db = SessionLocal()
    print("=== Top 5 by UserRating.rating ===")
    r1 = (db.query(User.username, UserRating.rating, UserStats.solved_count)
          .join(UserRating, User.id == UserRating.user_id)
          .outerjoin(UserStats, User.id == UserStats.user_id)
          .order_by(desc(UserRating.rating)).limit(5).all())
    for i, (u, r, s) in enumerate(r1):
        print(f"{i+1}. {u}: Rating={r}, Solved={s}")

    print("\n=== Top 5 by UserStats.rating ===")
    r2 = (db.query(User.username, UserStats.rating, UserStats.solved_count)
          .join(UserStats, User.id == UserStats.user_id)
          .order_by(desc(UserStats.rating)).limit(5).all())
    for i, (u, r, s) in enumerate(r2):
        print(f"{i+1}. {u}: Rating={r}, Solved={s}")
    db.close()

if __name__ == "__main__":
    check_leaderboard()
