from app.services.ai_service import _validate_python_snippet


def test_validate_python_snippet_accepts_valid_code():
    errors = _validate_python_snippet("def solve(x):\n    return x + 1\n")
    assert errors == []


def test_validate_python_snippet_reports_syntax_error():
    errors = _validate_python_snippet("def solve(x):\n    return x +\n")
    assert errors
    assert "Syntax xatosi" in errors[0]
