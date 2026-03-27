import os
import sys

sys.path.append(os.path.abspath('backend'))

from sqlalchemy.orm import Session
from app.api.routes.auth import calculate_user_stats
from app.database import SessionLocal, _sanitize_db_url
from app.services.user_stats_service import user_stats_service
from app.services.problem_service import get_problem_service
import asyncio

with SessionLocal() as db:
    print("Testing connection...")
    try:
        user_id = 1
        stats = user_stats_service.ensure_user_stats_fresh(db, user_id)
        print("Success:", stats)
    except Exception as e:
        import traceback
        traceback.print_exc()

async def get_prob():
    with SessionLocal() as db:
        print("Testing get_problem...")
        try:
            service = get_problem_service()
            problem = await service.get_problem("balanced-brackets-lite-02")
            print("Problem success:", problem)
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(get_prob())
