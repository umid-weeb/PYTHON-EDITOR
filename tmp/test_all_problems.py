#!/usr/bin/env python3
"""
Full suite test for all 120 Pyzone problems.
Runs the judge locally against correct solver solutions and reports any failures.
Usage: python tmp/test_all_problems.py
"""
from __future__ import annotations
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.services.problem_catalog import build_problem_catalog
from app.judge.runner import JudgeRunner
from app.judge.parser import parse_arguments
from app.core.config import get_settings

# ── Reference solutions keyed by slug_prefix ──────────────────────────────────
# Each function receives the SAME *args as the judge passes to solve()

def _divisible_sum(nums, divisor=2):
    # divisor is baked into expected_output via solver, but slug tells us which
    # We rely on the test case expected_output to verify; solver is embedded.
    pass  # not used directly – we generate per-slug below

# Build reference solvers from the catalog's own solvers
import importlib.util, string, random
from app.services.problem_catalog import (
    _divisible_sum_solver,
    _char_count_solver,
    _distinct_sort_solver,
    _balanced_brackets_solver,
    _clean_palindrome_solver,
    _pair_sum_solver,
    _lower_bound_solver,
    _frequency_leader_solver,
    _climb_ways_solver,
    _longest_unique_solver,
    _edit_distance_solver,
    _trap_water_solver,
)

# Map slug_prefix → correct Python code that implements solve()
SOLUTION_TEMPLATES: dict[str, str] = {
    "divisible-sum": """
class Solution:
    def solve(self, nums):
        divisor = __DIVISOR__
        return sum(v for v in nums if v % divisor == 0)
""",
    "pattern-char-count": """
class Solution:
    def solve(self, text):
        target = "__CHARS__"
        return sum(1 for c in text.lower() if c in set(target.lower()))
""",
    "distinct-sort": """
class Solution:
    def solve(self, nums):
        return sorted(set(nums), reverse=__REVERSE__)
""",
    "balanced-brackets-lite": """
class Solution:
    def solve(self, text):
        pairs = {')': '(', ']': '[', '}': '{'}
        openings = set(pairs.values())
        stack = []
        for c in text:
            if c in openings:
                stack.append(c)
            elif c in pairs:
                if not stack or stack.pop() != pairs[c]:
                    return False
        return not stack
""",
    "clean-palindrome-check": """
class Solution:
    def solve(self, text):
        letters_only = __LETTERS_ONLY__
        cleaned = ''.join(c.lower() for c in text if c.isalpha() or (not letters_only and c.isdigit()))
        return cleaned == cleaned[::-1]
""",
    "pair-sum-indices": """
class Solution:
    def solve(self, nums, target):
        lookup = {}
        for i, v in enumerate(nums):
            needed = target - v
            if needed in lookup:
                return [lookup[needed], i]
            if v not in lookup:
                lookup[v] = i
        return [-1, -1]
""",
    "lower-bound-search": """
class Solution:
    def solve(self, nums, target):
        lo, hi = 0, len(nums)
        while lo < hi:
            mid = (lo + hi) // 2
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid
        return lo
""",
    "frequency-leader": """
class Solution:
    def solve(self, nums):
        counts = {}
        for v in nums:
            counts[v] = counts.get(v, 0) + 1
        return min(counts, key=lambda v: (-counts[v], v))
""",
    "climbing-ways": """
class Solution:
    def solve(self, n):
        max_step = __MAX_STEP__
        dp = [0] * (max(1, n) + 1)
        dp[0] = 1
        for step in range(1, n + 1):
            dp[step] = sum(dp[step - j] for j in range(1, max_step + 1) if step - j >= 0)
        return dp[n]
""",
    "longest-unique-window": """
class Solution:
    def solve(self, text):
        seen = {}
        left = best = 0
        for right, c in enumerate(text):
            if c in seen and seen[c] >= left:
                left = seen[c] + 1
            seen[c] = right
            best = max(best, right - left + 1)
        return best
""",
    "edit-distance-grid": """
class Solution:
    def solve(self, left_text, right_text):
        rows, cols = len(left_text) + 1, len(right_text) + 1
        dp = [[0] * cols for _ in range(rows)]
        for r in range(rows): dp[r][0] = r
        for c in range(cols): dp[0][c] = c
        for r in range(1, rows):
            for c in range(1, cols):
                if left_text[r-1] == right_text[c-1]:
                    dp[r][c] = dp[r-1][c-1]
                else:
                    dp[r][c] = 1 + min(dp[r-1][c], dp[r][c-1], dp[r-1][c-1])
        return dp[-1][-1]
""",
    "trapped-rain-collector": """
class Solution:
    def solve(self, heights):
        left, right = 0, len(heights) - 1
        lmax = rmax = total = 0
        while left < right:
            if heights[left] <= heights[right]:
                lmax = max(lmax, heights[left])
                total += lmax - heights[left]
                left += 1
            else:
                rmax = max(rmax, heights[right])
                total += rmax - heights[right]
                right -= 1
        return total
""",
}

char_sets = ["aeiou", "salom", "kitob", "mantiq", "navbat", "stek", "daryo", "osmon", "raqam", "oqim"]

def make_solution_code(slug: str, variation_index: int) -> str:
    """Build the correct solution code for a given problem slug and variation index."""
    prefix = slug.rsplit("-", 1)[0]
    template = SOLUTION_TEMPLATES.get(prefix, "")

    if prefix == "divisible-sum":
        template = template.replace("__DIVISOR__", str(variation_index + 2))
    elif prefix == "pattern-char-count":
        chars = char_sets[variation_index]
        template = template.replace("__CHARS__", chars)
    elif prefix == "distinct-sort":
        reverse = "True" if variation_index % 2 else "False"
        template = template.replace("__REVERSE__", reverse)
    elif prefix == "clean-palindrome-check":
        letters_only = "True" if variation_index % 2 else "False"
        template = template.replace("__LETTERS_ONLY__", letters_only)
    elif prefix == "climbing-ways":
        max_step = str(2 + (variation_index % 2))
        template = template.replace("__MAX_STEP__", max_step)

    return template.strip()


def run_all_tests():
    catalog = build_problem_catalog()
    runner = JudgeRunner()

    passed = 0
    failed = 0
    errors = []

    print(f"Testing {len(catalog)} problems...\n")
    print(f"{'#':<5} {'Slug':<40} {'Status':<12} {'Details'}")
    print("-" * 100)

    for num, problem_seed in enumerate(catalog, start=1):
        slug = problem_seed.slug
        # Determine variation index from slug suffix
        suffix = slug.split("-")[-1]
        try:
            variation_index = int(suffix) - 1
        except ValueError:
            variation_index = 0

        prefix = slug.rsplit("-", 1)[0]
        solution_code = make_solution_code(slug, variation_index)

        if not solution_code:
            print(f"{num:<5} {slug:<40} {'SKIP':<12} No solution template")
            continue

        # Build the problem bundle that the runner expects
        visible_testcases = []
        hidden_testcases = []
        for i, tc in enumerate(problem_seed.test_cases):
            payload = {
                "name": f"Test {i+1}",
                "input": tc.input.strip(),
                "expected_output": tc.expected_output.strip(),
                "hidden": tc.is_hidden,
            }
            if tc.is_hidden:
                hidden_testcases.append(payload)
            else:
                visible_testcases.append(payload)

        problem_bundle = {
            "id": problem_seed.id,
            "slug": slug,
            "function_name": "solve",
            "language": "python",
            "time_limit_seconds": 3.0,
            "memory_limit_mb": 256,
            "visible_testcases": visible_testcases,
            "hidden_testcases": hidden_testcases,
        }

        # Run with "run" mode (visible test cases only)
        result = runner.run_submission(problem_bundle, solution_code, mode="run")

        all_passed = result.get("verdict") == "Accepted"
        passed_count = result.get("passed_count", 0)
        total_count = result.get("total_count", 0)

        if all_passed:
            passed += 1
            print(f"{num:<5} {slug:<40} {'✓ PASS':<12} {passed_count}/{total_count} cases")
        else:
            failed += 1
            error_text = result.get("error_text") or result.get("verdict", "Unknown")
            case_results = result.get("case_results", [])
            first_fail = next((cr for cr in case_results if not cr.get("passed")), None)
            detail = ""
            if first_fail:
                actual = first_fail.get("actual_output", "?")
                expected = first_fail.get("expected_output", "?")
                err = first_fail.get("error", "")
                input_val = first_fail.get("input", "?")
                detail = f"input={repr(input_val)[:50]} expected={repr(expected)[:30]} actual={repr(actual)[:30]}"
                if err:
                    detail = f"ERROR: {err[:80]}"
            errors.append((num, slug, error_text, detail))
            print(f"{num:<5} {slug:<40} {'✗ FAIL':<12} {passed_count}/{total_count} cases | {error_text[:30]}")

    print("\n" + "=" * 100)
    print(f"RESULT: {passed} passed, {failed} failed out of {len(catalog)} problems")

    if errors:
        print("\n── FAILURES ──")
        for num, slug, verdict, detail in errors:
            print(f"  #{num} {slug}")
            print(f"       verdict: {verdict}")
            if detail:
                print(f"       {detail}")
    else:
        print("\n🎉 All problems passed!")

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
