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
from app.api.routes.contests import router as contest_router, ws_router as contest_ws_router
from app.api.routes.engagement import router as engagement_router
from app.api.routes.ai import router as ai_router
from app.core.config import get_settings
from app.database import Base, engine
from app.database import SessionLocal
from app import models as _models  # noqa: F401
from app.services.problem_catalog import ensure_problem_catalog_seeded
from app.services.db_bootstrap import run_startup_migrations
from app.services.engagement_service import engagement_service
from app.services.submission_service import get_submission_service


settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # DB schema migrations (fast — DDL only)
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
    Base.metadata.create_all(bind=engine)

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
                engagement_service.ensure_upcoming_daily_challenges(db)
                db.commit()
            logger.info("Background catalog sync completed.")
        except Exception as exc:  # pragma: no cover
            logger.warning("Background catalog sync failed: %s", exc)

    threading.Thread(target=_background_sync, daemon=True, name="catalog-sync").start()

    # Self-ping keep-alive: prevent Render free tier from sleeping.
    # Render spins down services after 15 min of no traffic.
    # We ping our own /health every 10 minutes to stay awake.
    def _keep_alive() -> None:
        import time
        import urllib.request
        # Wait for the server to fully start before first ping
        time.sleep(30)
        public_url = getattr(settings, "public_url", None) or "https://python-editor-b87c.onrender.com"
        ping_url = f"{public_url.rstrip('/')}/health"
        while True:
            try:
                urllib.request.urlopen(ping_url, timeout=10)  # noqa: S310
                logger.debug("Keep-alive ping sent to %s", ping_url)
            except Exception:
                pass
            time.sleep(600)  # 10 minutes

    threading.Thread(target=_keep_alive, daemon=True, name="keep-alive").start()

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
app.include_router(ai_router, prefix=settings.api_prefix)
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
        "name": settings.app_name,
        "status": "ok",
        "api_prefix": settings.api_prefix,
    }
