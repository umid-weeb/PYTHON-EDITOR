import sys
import os
import traceback

sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.submission_service import get_submission_service
from app.models.schemas import SubmissionRequest

db = SessionLocal()
service = get_submission_service()

try:
    req = SubmissionRequest(
        problem_id="balanced-brackets-lite-02",
        code="def solve(s):\n    return True",
        language="python"
    )
    # Testing create_submission
    sub_id = service.create_submission(req, mode="run", user_id=None)
    print("Created sub_id:", sub_id)
    
    # Testing enqueue_submission
    service.enqueue_submission(sub_id)
    print("Enqueued sub_id:", sub_id)
except Exception as e:
    with open("err_sub.txt", "w", encoding="utf-8") as f:
        f.write(traceback.format_exc())
