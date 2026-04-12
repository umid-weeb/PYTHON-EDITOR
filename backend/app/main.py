from __future__ import annotations

import asyncio
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as user_router, account_router
from app.api.routes.problems import router as problem_router
from app.api.routes.submissions import router as submission_router
from app.api.routes.editor import router as editor_router
from app.api.routes.contests import router as contest_router, ws_router as contest_ws_router
from app.api.routes.engagement import router as engagement_router
from app.api.routes.ai import router as ai_router
from app.core.config import get_settings
from app.database import Base, engine
from app.database import SessionLocal
from app import models as _models  # noqa: F401
from app.services.problem_catalog import ensure_problem_catalog_seeded
from app.services.sql_problem_catalog import ensure_sql_problem_catalog_seeded
from app.services.db_bootstrap import run_startup_migrations
from app.services.engagement_service import engagement_service
from app.services.submission_service import get_submission_service
from app.services.editor_runtime_service import get_editor_runtime_service


settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

# Global flag – set to True once the catalog seed has finished.
# Checked by the runner so it can return a friendly "please wait" error
# instead of a confusing "testcase not found" when a user hits Run
# before the background sync has completed.
catalog_ready = threading.Event()

# Global flag – set to True once DB schema migrations have completed.
migrations_complete = False


@asynccontextmanager
async def lifespan(_: FastAPI):
    global migrations_complete
    # DB schema migrations (fast — DDL only)
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
    Base.metadata.create_all(bind=engine)
    migrations_complete = True

    # Start submission recovery loop
    submission_service = get_submission_service()
    submission_service.start_recovery_loop()

    # Run the heavy catalog seed in a background thread so the health
    # check endpoint is reachable immediately and Render doesn't mark
    # the service as DOWN during startup.
    def _background_sync() -> None:
        try:
            logger.info("Background catalog sync starting...")
            with SessionLocal() as db:
                ensure_problem_catalog_seeded(db)
                ensure_sql_problem_catalog_seeded(db)
                engagement_service.ensure_upcoming_daily_challenges(db)
                db.commit()
            logger.info("Background catalog sync completed.")
        except Exception as exc:  # pragma: no cover
            logger.warning("Background catalog sync failed: %s", exc)
        finally:
            # Always mark ready so the flag eventually unblocks even on error
            catalog_ready.set()

    threading.Thread(target=_background_sync, daemon=True, name="catalog-sync").start()

    # Self-ping keep-alive: prevent Render free tier from sleeping.
    # Render spins down services after 15 min of no traffic.
    # We ping our own /health every 10 minutes to stay awake.
    def _keep_alive() -> None:
        import time
        import urllib.request
        # Wait for the server to fully start before first ping
        time.sleep(30)
        public_url = getattr(settings, "public_url", None) or "http://127.0.0.1:8000"
        ping_url = f"{public_url.rstrip('/')}/health"
        while True:
            try:
                urllib.request.urlopen(ping_url, timeout=10)  # noqa: S310
                logger.debug("Keep-alive ping sent to %s", ping_url)
            except Exception:
                pass
            time.sleep(600)  # 10 minutes

    threading.Thread(target=_keep_alive, daemon=True, name="keep-alive").start()

    def _automated_engagement_loop() -> None:
        """Periodically run AI engagement scans and send notifications."""
        import time
        while True:
            try:
                # Wait 6 hours between scans
                time.sleep(21600) 
                
                logger.info("Starting automated engagement scan...")
                from app.services.engagement_service import engagement_specialist
                
                with SessionLocal() as db:
                    # Run async notification method from synchronous thread
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    loop.run_until_complete(engagement_specialist.run_automated_notifications(db))
                    loop.close()
                    
                logger.info("Automated engagement scan completed.")
            except Exception as e:
                logger.error(f"Engagement loop failed: {e}")
                time.sleep(3600)  # Retry in 1 hour if failed

    def _daily_maintenance_loop() -> None:
        """Runs once daily at 8:00 PM (20:00) Tashkent time."""
        import time
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from app.services.marketing_service import marketing_service
        
        last_run_date = None
        tz = ZoneInfo("Asia/Tashkent")
        
        logger.info("Daily maintenance scheduler active (checks for 20:00 Asia/Tashkent).")
        
        while True:
            try:
                now = datetime.now(tz)
                today = now.date()
                
                # Check if it's 8:00 PM (20:00) and hasn't run today
                if now.hour == 20 and now.minute == 0 and last_run_date != today:
                    logger.info("🎬 [Maintenance] Triggering scheduled daily motivation (20:00)...")
                    with SessionLocal() as db:
                        # Create a dedicated event loop for this async execution in a worker thread
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        loop.run_until_complete(marketing_service.send_daily_motivation(db))
                        loop.close()
                    
                    last_run_date = today
                    logger.info("✅ [Maintenance] Daily motivation completed.")
                
                # Sleep and check again
                time.sleep(45) 
            except Exception as e:
                logger.error(f"Maintenance loop failed: {e}")
                time.sleep(60)

    threading.Thread(target=_automated_engagement_loop, daemon=True, name="engagement-agent").start()
    threading.Thread(target=_daily_maintenance_loop, daemon=True, name="daily-maintenance").start()

    def _warm_editor_runtimes() -> None:
        try:
            logger.info("Editor runtime warmup starting...")
            get_editor_runtime_service().warm_default_runtimes()
            logger.info("Editor runtime warmup completed.")
        except Exception as exc:  # pragma: no cover
            logger.warning("Editor runtime warmup failed: %s", exc)

    threading.Thread(target=_warm_editor_runtimes, daemon=True, name="editor-runtime-warmup").start()

    try:
        yield
    finally:
        submission_service.stop_recovery_loop()


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

default_cors_origins = [
    "https://pyzone.uz",
    "https://www.pyzone.uz",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
allowed_origins = sorted({*default_cors_origins, *settings.cors_allow_origins})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://([a-z0-9-]+\.)?pyzone\.uz$|^https://[a-z0-9-]+\.vercel\.app$|^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(problem_router, prefix=settings.api_prefix)
app.include_router(submission_router, prefix=settings.api_prefix)
app.include_router(editor_router, prefix=f"{settings.api_prefix}/editor")
app.include_router(ai_router, prefix=f"{settings.api_prefix}/ai")
app.include_router(contest_router, prefix=settings.api_prefix)
app.include_router(contest_ws_router)
app.include_router(engagement_router, prefix=settings.api_prefix)
app.include_router(health_router)
app.include_router(user_router, prefix=settings.api_prefix)
app.include_router(account_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)

# Serve uploaded avatars
uploads_root = settings.backend_root / "uploads"
uploads_root.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_root), name="uploads")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "PyZone Arena API",
        "version": "1.0.0",
        "status": "healthy",
        "catalog_ready": str(catalog_ready.is_set()),
        "migrations_complete": str(migrations_complete)
    }
