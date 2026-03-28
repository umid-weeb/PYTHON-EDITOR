from app.judge.runner import JudgeRunner
import json
import codecs

runner = JudgeRunner()
problem = {
    "language": "python",
    "function_name": "solve",
    "time_limit_seconds": 1.0,
    "memory_limit_mb": 256,
    "visible_testcases": [
        {"input": "[1, 2, 3]", "expected_output": "6"}
    ]
}

code = """class Solution:
    def solve(self, nums):
        print(i) # NameError
        return sum(nums)
"""

res = runner.run_submission(problem, code, mode="run")
with codecs.open("out.json", "w", "utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
