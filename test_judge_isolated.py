import sys
import os
import json
from pathlib import Path

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from app.judge.runner import JudgeRunner
from app.core.config import get_settings

def test_judge_isolated():
    # Set dummy env vars for config if needed
    os.environ["ARENA_JWT_SECRET"] = "test"
    
    runner = JudgeRunner(get_settings())
    
    problem = {
        "function_name": "solve",
        "time_limit_seconds": 1.0,
        "memory_limit_mb": 256,
        "language": "python",
        "visible_testcases": [
            {"name": "Test 1", "input": "[1, 2, 3, 4]", "expected_output": "6", "hidden": False}
        ]
    }
    
    # Correct code: sums even numbers. 2 + 4 = 6.
    code_ok = """
class Solution:
    def solve(self, nums):
        res = sum(x for x in nums if x % 2 == 0)
        return res
"""
    
    # Failing code: NameError
    code_fail = """
class Solution:
    def solve(self, nums):
        return xisob + 1 # NameError: xisob is not defined
"""
    
    print("--- Testing OK Code ---")
    result_ok = runner.run_submission(problem, code_ok, mode="run")
    print(f"Verdict: {result_ok['verdict']}")
    
    print("\n--- Testing FAILING Code ---")
    result_fail = runner.run_submission(problem, code_fail, mode="run")
    print(f"Verdict: {result_fail['verdict']}")
    if result_fail.get("error_text"):
        print(f"Error: {result_fail['error_text']}")
    
    if result_ok["verdict"] == "Accepted" and result_fail["verdict"] == "Runtime Error":
        print("\nSUCCESS: Judge returned correct verdicts for both cases!")
    else:
        print("\nFAILURE: Unexpected results.")

if __name__ == "__main__":
    test_judge_isolated()
