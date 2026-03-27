import json
import subprocess
import os
import sys
from pathlib import Path

# Create a temporary workspace
workspace = Path("test_workspace")
workspace.mkdir(exist_ok=True)

# User's code
code = """
class Solution:
    def solve(self, nums):
        print("I am printing some garbage text here!")
        return sum(nums)
"""
(workspace / "submission.py").write_text(code)

# Get HARNESS_CODE from runner.py
sys.path.append(os.getcwd())
try:
    from app.judge.runner import HARNESS_CODE
except ImportError:
    # If path is weird, just dummy it for this test
    print("Could not import HARNESS_CODE")
    sys.exit(1)

(workspace / "harness.py").write_text(HARNESS_CODE)

# Payload
payload = {
    "function_name": "solve",
    "args": [[1, 2, 3]]
}
(workspace / "payload.json").write_text(json.dumps(payload))

# Run it
print("Running harness...")
try:
    completed = subprocess.run(
        [sys.executable, "harness.py"],
        cwd=workspace,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    print("STDOUT:")
    print(completed.stdout)
    print("STDERR:")
    print(completed.stderr)
    
    # Check if we can extract JSON
    stdout = completed.stdout
    start_marker = "<<<JSON_START>>>"
    end_marker = "<<<JSON_END>>>"
    if start_marker in stdout and end_marker in stdout:
        raw_json = stdout.split(start_marker)[1].split(end_marker)[0].strip()
        data = json.loads(raw_json)
        print("Extracted JSON successfully!")
        print(json.dumps(data, indent=2))
        if data["actual"] == 6:
            print("VALUE MATCHES!")
        else:
            print(f"VALUE MISMATCH: {data['actual']}")
    else:
        print("MARKERS NOT FOUND!")

finally:
    # Cleanup
    import shutil
    shutil.rmtree(workspace)
