"""Verify signature inference + end-to-end stub generation for legacy problems."""
from app.judge.signature import infer_signature, infer_type_from_value, parse_param_names
from app.judge.stub_generator import generate_stub


def test_type_inference():
    assert infer_type_from_value(5) == "int"
    assert infer_type_from_value(True) == "bool"
    assert infer_type_from_value(3.5) == "float"
    assert infer_type_from_value("hi") == "string"
    assert infer_type_from_value([1, 2, 3]) == "int[]"
    assert infer_type_from_value([[1], [2]]) == "int[][]"
    assert infer_type_from_value(["a", "b"]) == "string[]"


def test_param_names_from_starter():
    code = "class Solution:\n    def twoSum(self, nums, target):\n        pass"
    assert parse_param_names(code) == ["nums", "target"]


def test_infer_two_sum_signature_from_legacy_data():
    spec = infer_signature(
        function_name="twoSum",
        starter_code="class Solution:\n    def twoSum(self, nums, target):\n        pass",
        test_cases=[{"input": "[2, 7, 11, 15]\n9", "expected_output": "[0, 1]"}],
    )
    assert spec["function_name"] == "twoSum"
    assert spec["params"] == [
        {"name": "nums", "type": "int[]"},
        {"name": "target", "type": "int"},
    ]
    assert spec["returns"] == {"type": "int[]"}

    # And the inferred spec feeds the generator to produce a correct stub.
    assert "vector<int> twoSum(vector<int>& nums, int target)" in generate_stub(spec, "cpp")
    assert "func twoSum(nums []int, target int) []int" in generate_stub(spec, "go")


def test_infer_handles_missing_starter_uses_test_only():
    spec = infer_signature(
        function_name="solve",
        starter_code="",
        test_cases=[{"input": "hello\n3", "expected_output": "true"}],
    )
    # names fall back to arg0/arg1; types from values
    assert spec["params"][0]["type"] == "string"
    assert spec["params"][1]["type"] == "int"
    assert spec["returns"]["type"] == "bool"
