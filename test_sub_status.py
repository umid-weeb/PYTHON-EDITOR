import sys
import os
import json
import time
from datetime import datetime

sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.submission_service import get_submission_service

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

service = get_submission_service()

# Wait for processing
for _ in range(10):
    status = service.get_submission("64")
    if status and status.get("status") not in ["pending", "running"]:
        break
    print("Waiting for processing...")
    time.sleep(2)

print(json.dumps(status, indent=2, ensure_ascii=False, cls=DateTimeEncoder))
