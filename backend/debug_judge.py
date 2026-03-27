import asyncio
import json
import os
import sys
from pathlib import Path

# Add current directory to sys.path to find 'app'
sys.path.append(os.getcwd())

from app.services.submission_service import get_submission_service
from app.models.schemas import SubmissionRequest
from app.database import SessionLocal

async def test_run():
    service = get_submission_service()
    
    # User's code from screenshot
    code = """class Solution:
    def solve(self, nums):
        yigindi = 0
        for son in nums:
            if son % 2 == 0:
                yigindi += son
        return yigindi
"""
    
    payload = SubmissionRequest(
        problem_id="divisible-sum-01",
        code=code,
        language="python"
    )
    
    print("Creating submission...")
    submission_id = service.create_submission(payload, mode="run", user_id=None)
    
    print("Processing...")
    # Trigger processing - it will run in a new thread
    service.process_submission(submission_id)
    
    # Wait for completion
    import time
    for _ in range(10):
        time.sleep(1)
        res = service.get_submission(submission_id)
        if res["status"] == "completed":
            print("Completed!")
            print(json.dumps(res, indent=2, ensure_ascii=False))
            return
        print(f"Status: {res['status']}")

if __name__ == "__main__":
    asyncio.run(test_run())
