"""
Starter-code service: the glue between a problem's signature spec, the
per-language stub generator, and persistence in ``problem_starter_codes``.

Used by:
  - problem bundle building (lazy, on-the-fly map for the editor)
  - backfill of existing problems
  - AI import / admin panel regeneration
"""
from __future__ import annotations

import json
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.judge.signature import infer_signature
from app.judge.stub_generator import SUPPORTED_LANGUAGES, generate_all_stubs
from app.models.problem import Problem, ProblemStarterCode


# --------------------------------------------------------------------------- #
# Pure helpers (no DB session required)
# --------------------------------------------------------------------------- #
def resolve_signature(
    *,
    signature_json: str | None,
    function_name: str | None,
    starter_code: str | None,
    test_cases: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Return a parsed signature spec, inferring one if none is stored yet."""
    if signature_json:
        try:
            spec = json.loads(signature_json)
            if isinstance(spec, dict) and spec.get("params") is not None:
                return spec
        except (ValueError, TypeError):
            pass
    return infer_signature(
        function_name=function_name,
        starter_code=starter_code,
        test_cases=test_cases,
    )


def build_starter_codes_map(
    *,
    signature: dict[str, Any],
    persisted: dict[str, str] | None = None,
    python_fallback: str | None = None,
) -> dict[str, str]:
    """Full per-language map for the editor.

    Persisted (DB) rows win; missing languages are generated from the spec.
    Python prefers the problem's existing ``starter_code`` so legacy problems
    keep the exact stub users already see.
    """
    persisted = persisted or {}
    generated = generate_all_stubs(signature)
    result: dict[str, str] = {}
    for lang in SUPPORTED_LANGUAGES:
        if persisted.get(lang):
            result[lang] = persisted[lang]
        elif lang == "python" and python_fallback and python_fallback.strip():
            result[lang] = python_fallback
        else:
            result[lang] = generated[lang]
    return result


# --------------------------------------------------------------------------- #
# DB helpers
# --------------------------------------------------------------------------- #
def _test_cases_payload(problem: Problem) -> list[dict[str, Any]]:
    return [
        {"input": tc.input, "expected_output": tc.expected_output}
        for tc in (problem.test_cases or [])
    ]


def backfill_problem(
    db: Session,
    problem: Problem,
    *,
    overwrite_custom: bool = False,
) -> dict[str, Any]:
    """Ensure ``signature_json`` + all per-language rows exist for one problem.

    Idempotent. ``is_custom`` rows are preserved unless ``overwrite_custom``.
    Returns the signature spec used.
    """
    spec = resolve_signature(
        signature_json=problem.signature_json,
        function_name=problem.function_name,
        starter_code=problem.starter_code,
        test_cases=_test_cases_payload(problem),
    )
    if not problem.signature_json:
        problem.signature_json = json.dumps(spec, ensure_ascii=False)

    generated = generate_all_stubs(spec)
    # Preserve the legacy Python starter for the python row.
    if problem.starter_code and problem.starter_code.strip():
        generated["python"] = problem.starter_code

    existing = {sc.language: sc for sc in (problem.starter_codes or [])}
    for lang in SUPPORTED_LANGUAGES:
        code = generated[lang]
        row = existing.get(lang)
        if row is None:
            db.add(
                ProblemStarterCode(
                    problem_id=problem.id,
                    language=lang,
                    code=code,
                    is_custom=False,
                )
            )
        elif overwrite_custom or not row.is_custom:
            row.code = code
    return spec


def _is_complete(problem: Problem) -> bool:
    """True when the problem already has a signature + all language rows."""
    if not problem.signature_json:
        return False
    langs = {sc.language for sc in (problem.starter_codes or [])}
    return set(SUPPORTED_LANGUAGES).issubset(langs)


def backfill_all(db: Session, *, overwrite_custom: bool = False) -> int:
    """Backfill every problem (always regenerates). Returns count processed."""
    problems = db.query(Problem).all()
    for problem in problems:
        backfill_problem(db, problem, overwrite_custom=overwrite_custom)
    db.commit()
    return len(problems)


def backfill_missing(db: Session) -> int:
    """Backfill only problems that lack a signature or some language rows.

    Cheap and idempotent — a no-op once every problem is complete. Suitable
    for one-off scripts and post-deploy runs. Returns count actually filled.
    """
    problems = db.query(Problem).all()
    filled = 0
    for problem in problems:
        if _is_complete(problem):
            continue
        backfill_problem(db, problem)
        filled += 1
    if filled:
        db.commit()
    return filled


def persisted_map_from_rows(rows: Iterable[ProblemStarterCode]) -> dict[str, str]:
    return {row.language: row.code for row in rows if row.code}
