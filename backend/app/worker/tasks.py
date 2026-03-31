from __future__ import annotations

from app.services.submission_service import get_submission_service
from app.services.marketing_service import get_marketing_service
from app.worker.celery_app import celery_app
from app.database import SessionLocal


@celery_app.task(name="arena.process_submission")
def process_submission_task(submission_id: str) -> None:
    service = get_submission_service()
    service.process_submission(submission_id)


@celery_app.task(name="arena.send_daily_motivation")
def send_daily_motivation_task() -> None:
    import asyncio
    service = get_marketing_service()
    db = SessionLocal()
    try:
        # Run the async service in the current event loop (or a new one)
        asyncio.run(service.send_daily_motivation(db))
    finally:
        db.close()
