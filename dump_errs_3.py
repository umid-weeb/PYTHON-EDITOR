import traceback, sys, os
sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.user_stats_service import user_stats_service

db = SessionLocal()
if os.path.exists('err1.txt'):
    os.remove('err1.txt')

try:
    user_stats_service.ensure_user_stats_fresh(db, 1)
except Exception as e:
    with open('err1.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())
