import asyncio
import logging
import os
import sys
import random
from datetime import datetime, timedelta, timezone

# Ensure the app module can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.user import User, PasswordReset
from app.services.notification_service import notification_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug_reset")

async def force_test_reset_code():
    email = "isroilov0705@gmail.com".strip().lower()
    db = SessionLocal()
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        print("❌ User not found!")
        return

    # Generate 4-digit code
    code = "".join([str(random.randint(0, 9)) for _ in range(4)])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)

    # Clean up old codes
    db.query(PasswordReset).filter(PasswordReset.user_id == user.id).delete()
    
    reset_entry = PasswordReset(
        user_id=user.id,
        code=code,
        expires_at=expires_at
    )
    db.add(reset_entry)
    db.commit()

    print(f"🚀 Sending code {code} to {email}...")
    
    # Send Email
    subject = "PyZone Arena: DEBUG Parolni tiklash kodi"
    body = f"Salom! Sizning tasdiqlash kodingiz: {code}. Ushbu kod 60 soniya amal qiladi."
    
    # Try Plain Text first to rule out HTML filters
    sent = notification_service.send_email(email, subject, body, is_html=False)
    
    if sent:
        print(f"✅ DEBUG Email successfully sent! Code in DB is {code}")
    else:
        print("❌ DEBUG Email sending failed locally. Check .env and SMTP.")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(force_test_reset_code())
