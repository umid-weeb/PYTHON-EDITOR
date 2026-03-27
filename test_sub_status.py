import sys
import os
import time
import json
sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.submission_service import get_submission_service

service = get_submission_service()
status = service.get_submission("47")
print(json.dumps(status, indent=2, ensure_ascii=False))

