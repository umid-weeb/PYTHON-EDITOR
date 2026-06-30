"""
Infer a language-agnostic signature spec for an existing problem.

Existing problems only carry a single Python ``starter_code`` + ``function_name``
and a set of test cases. To generate per-language stubs we need a spec:

    {"function_name": str, "params": [{"name","type"}], "returns": {"type"}}

Strategy (deterministic, no AI required):
  - function_name : problem.function_name, else parsed from the Python starter.
  - param names   : parsed from the Python ``def`` signature (minus ``self``).
  - param types   : inferred from the FIRST test case's parsed input values.
  - return type   : inferred from the FIRST test case's expected output.

AI may later refine/override this, but inference gives a correct-enough spec
to backfill every problem automatically.
"""
from __future__ import annotations

import re
from typing import Any

from app.judge.parser import parse_arguments, parse_text_value

_DEF_RE = re.compile(r"def\s+(\w+)\s*\(([^)]*)\)")


def infer_type_from_value(value: Any) -> str:
    """Map a parsed Python value to an abstract type name."""
    # bool is a subclass of int — check it first.
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, tuple)):
        if not value:
            return "int[]"  # empty -> safe default, refine via override
        return infer_type_from_value(value[0]) + "[]"
    return "int"


def parse_param_names(starter_code: str) -> list[str]:
    """Extract parameter names from the first ``def`` in the Python starter."""
    match = _DEF_RE.search(starter_code or "")
    if not match:
        return []
    names: list[str] = []
    for part in match.group(2).split(","):
        token = part.strip()
        if not token or token == "self" or token.startswith("*"):
            continue
        name = token.split(":")[0].split("=")[0].strip()
        if name and name != "self":
            names.append(name)
    return names


def parse_function_name(starter_code: str) -> str | None:
    match = _DEF_RE.search(starter_code or "")
    return match.group(1) if match else None


def infer_signature(
    *,
    function_name: str | None,
    starter_code: str | None,
    test_cases: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Build a best-effort signature spec from a problem's existing data."""
    fn = (function_name or "").strip() or parse_function_name(starter_code or "") or "solve"
    names = parse_param_names(starter_code or "")

    first = (test_cases or [{}])[0] if test_cases else {}
    raw_input = first.get("input", "") if isinstance(first, dict) else ""
    values = parse_arguments(raw_input) if raw_input else []

    params: list[dict[str, str]] = []
    count = max(len(names), len(values))
    for i in range(count):
        name = names[i] if i < len(names) else f"arg{i}"
        ptype = infer_type_from_value(values[i]) if i < len(values) else "int"
        params.append({"name": name, "type": ptype})

    expected_raw = first.get("expected_output", "") if isinstance(first, dict) else ""
    if expected_raw not in (None, ""):
        return_type = infer_type_from_value(parse_text_value(str(expected_raw)))
    else:
        return_type = "int[]"

    return {
        "function_name": fn,
        "params": params,
        "returns": {"type": return_type},
    }
