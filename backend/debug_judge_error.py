import json
import os
import sys

# Add current directory to sys.path to find 'app'
sys.path.append(os.getcwd())

from app.services.submission_service import get_submission_service
from app.models.schemas import SubmissionRequest

def test_run():
    service = get_submission_service()
    
    # User's code from screenshot, intentionally bad
    code = """class Solution:
    def solve(self, nums):
        yigindi = 0
        for son in nums:
            print(i) # NameError
            if son % 2 == 0:
                yigindi += son
        return yigindi
"""
    
    payload = SubmissionRequest(
        problem_id="divisible-sum-01",
        code=code,
        language="python"
    )
    
    submission_id = service.create_submission(payload, mode="run", user_id=1)
    service.process_submission(submission_id)
    
    res = service.get_submission(submission_id)
    print(json.dumps(res, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    test_run()
