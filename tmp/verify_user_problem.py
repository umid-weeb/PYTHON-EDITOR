import sys
import os
import json
from pathlib import Path

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from app.judge.runner import JudgeRunner
from app.core.config import get_settings

def verify_user_problem():
    # Set dummy env vars for config
    os.environ["ARENA_JWT_SECRET"] = "test"
    
    runner = JudgeRunner(get_settings())
    
    # Problem data based on the screenshot
    problem = {
        "function_name": "solve",
        "time_limit_seconds": 1.0,
        "memory_limit_mb": 256,
        "language": "python",
        "visible_testcases": [
            {
                "name": "Misol 1", 
                "input": "[75, 57, -2, -36, 48, -25, 50, -37, 43, 58]", 
                "expected_output": "118", 
                "hidden": False
            }
        ]
    }
    
    # User's code from the screenshot
    user_code = """
class Solution:
    def solve(self, nums):
        xisob = 0
        for i in nums:
            if i % 2 == 0:
                xisob += i
        return xisob
"""
    
    print("--- Running Test for '2 ga bo'linadigan sonlar yig'indisi' ---")
    result = runner.run_submission(problem, user_code, mode="run")
    
    print(f"Verdict: {result['verdict']}")
    if result.get("case_results"):
        case = result["case_results"][0]
        print(f"Input: {case['input']}")
        print(f"Expected: {case['expected_output']}")
        print(f"Actual: {case['actual_output']}")
        print(f"Passed: {case['passed']}")
    
    if result.get("error_text"):
        print(f"Error: {result['error_text']}")

if __name__ == "__main__":
    verify_user_problem()
