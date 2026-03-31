import asyncio
import logging
import os
import sys

# Ensure the app module can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.services.marketing_service import get_marketing_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mass_mailing")

async def send_now():
    db = SessionLocal()
    service = get_marketing_service()
    try:
        logger.info("🚀 Starting immediate mass motivation send...")
        await service.send_daily_motivation(db)
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(send_now())
