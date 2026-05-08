import sys
import os
import asyncio
import logging

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.services.marketing_service import get_marketing_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trigger_motivation")

async def main():
    logger.info("🚀 Triggering mass motivation emails...")
    service = get_marketing_service()
    db = SessionLocal()
    try:
        count = await service.send_daily_motivation(db)
        logger.info(f"✅ Finished! Successfully sent to {count} users.")
    except Exception as e:
        logger.error(f"❌ Failed to send emails: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
