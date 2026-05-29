from app.services.ai_service import _is_echoed_solution, _validate_python_snippet


def test_validate_python_snippet_accepts_valid_code():
    errors = _validate_python_snippet("def solve(x):\n    return x + 1\n")
    assert errors == []


def test_validate_python_snippet_reports_syntax_error():
    errors = _validate_python_snippet("def solve(x):\n    return x +\n")
    assert errors
    assert "Syntax xatosi" in errors[0]


def test_is_echoed_solution_detects_duplicate_code():
    assert _is_echoed_solution("def solve(x):\n    return x", "def solve(x):\n    return x")


def test_is_echoed_solution_allows_new_implementation():
    assert not _is_echoed_solution("def solve(x):\n    return x + 1", "def solve(x):\n    return x")
