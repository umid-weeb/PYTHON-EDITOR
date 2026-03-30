import asyncio
import logging
import os
import sys

# Ensure the app module can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.user import User
from app.services.notification_service import notification_service

logging.basicConfig(level=logging.INFO)

async def test_email():
    db = SessionLocal()
    user = db.query(User).filter(User.email == "isroilov0705@gmail.com").first()
    
    if not user:
        print("❌ User not found in database!")
        return

    print(f"📧 Sending test email to {user.email}...")
    
    # Simulate a motivation message
    test_msg = "Tabriklayman! PyZone Arena email tizimi muvaffaqiyatli ishga tushdi. 🚀 Endi siz har doim yangi masalalar va streak-ingizdan xabardor bo'lib turasiz!"
    
    success = await notification_service.notify_user(
        user, 
        message=test_msg, 
        subject="PyZone Arena: Test Email"
    )
    
    if success:
        print("✅ Email successfully sent!")
    else:
        print("❌ Email sending failed. Check logs.")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(test_email())
