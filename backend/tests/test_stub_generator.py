"""Verify the per-language stub generator matches LeetCode-style signatures."""
from app.judge.stub_generator import generate_all_stubs, generate_stub, SUPPORTED_LANGUAGES

TWO_SUM = {
    "function_name": "twoSum",
    "params": [
        {"name": "nums", "type": "int[]"},
        {"name": "target", "type": "int"},
    ],
    "returns": {"type": "int[]"},
}


def test_all_languages_render():
    stubs = generate_all_stubs(TWO_SUM)
    assert set(stubs) == set(SUPPORTED_LANGUAGES)
    for lang, code in stubs.items():
        assert code.strip(), f"{lang} produced empty stub"
        assert "twoSum" in code or "TwoSum" in code, f"{lang} missing function name"


def test_python():
    code = generate_stub(TWO_SUM, "python")
    assert "class Solution:" in code
    assert "def twoSum(self, nums: List[int], target: int) -> List[int]:" in code
    assert "from typing import List" in code


def test_javascript():
    code = generate_stub(TWO_SUM, "javascript")
    assert "@param {number[]} nums" in code
    assert "@return {number[]}" in code
    assert "var twoSum = function(nums, target) {" in code


def test_typescript():
    code = generate_stub(TWO_SUM, "typescript")
    assert "function twoSum(nums: number[], target: number): number[] {" in code


def test_java():
    code = generate_stub(TWO_SUM, "java")
    assert "public int[] twoSum(int[] nums, int target) {" in code
    assert "class Solution {" in code


def test_cpp():
    code = generate_stub(TWO_SUM, "cpp")
    assert "vector<int> twoSum(vector<int>& nums, int target) {" in code
    assert "public:" in code


def test_c():
    code = generate_stub(TWO_SUM, "c")
    assert "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {" in code
    assert "must be malloced" in code


def test_csharp():
    code = generate_stub(TWO_SUM, "csharp")
    assert "public int[] TwoSum(int[] nums, int target) {" in code  # PascalCase


def test_go():
    code = generate_stub(TWO_SUM, "go")
    assert "func twoSum(nums []int, target int) []int {" in code


def test_2d_and_string_types():
    spec = {
        "function_name": "solve",
        "params": [
            {"name": "grid", "type": "int[][]"},
            {"name": "word", "type": "string"},
        ],
        "returns": {"type": "bool"},
    }
    assert "List[List[int]]" in generate_stub(spec, "python")
    assert "vector<vector<int>>& grid" in generate_stub(spec, "cpp")
    assert "int[][] grid" in generate_stub(spec, "java")
    assert "grid [][]int" in generate_stub(spec, "go")
    assert "string word" in generate_stub(spec, "csharp")
