from __future__ import annotations

from celery import Celery

from app.core.config import get_settings


from celery.schedules import crontab


settings = get_settings()

celery_app = Celery(
    "arena_judge",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    timezone="Asia/Tashkent",
    enable_utc=False,
)

# Schedule daily motivation at 8:00 PM (20:00)
celery_app.conf.beat_schedule = {
    "send-daily-motivation-8pm": {
        "task": "arena.send_daily_motivation",
        "schedule": crontab(hour=20, minute=0),
    },
}
