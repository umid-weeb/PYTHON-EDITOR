"""
Admin qilish script.
Foydalanish:
  python scripts/set_admin.py --email isroilov0705@gmail.com
  python scripts/set_admin.py --email isroilov0705@gmail.com --unset
"""
import argparse
import os
import sys

# backend/ papkasi path ga qo'shish
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User


def set_admin(email: str, is_admin: bool = True):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"Foydalanuvchi topilmadi: {email}")
            return False

        user.is_admin = is_admin
        db.commit()
        action = "ADMIN qilindi" if is_admin else "Admin huquqi olindi"
        print(f"{action}: {email} (id={user.id}, username={user.username})")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Foydalanuvchiga admin huquqi berish")
    parser.add_argument("--email", required=True, help="Email manzil")
    parser.add_argument("--unset", action="store_true", help="Admin huquqini olib qo'yish")
    args = parser.parse_args()

    success = set_admin(args.email, is_admin=not args.unset)
    sys.exit(0 if success else 1)
