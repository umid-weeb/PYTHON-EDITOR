import traceback, sys, os
sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.user_stats_service import user_stats_service
from app.services.problem_service import get_problem_service
import asyncio

db = SessionLocal()
try:
    user_stats_service.ensure_user_stats_fresh(db, 1)
except Exception as e:
    with open('err1.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())

try:
    asyncio.run(get_problem_service().get_problem('balanced-brackets-lite-02'))
except Exception as e:
    with open('err2.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())
