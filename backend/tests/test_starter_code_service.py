"""Backfill + per-language map service, against in-memory SQLite."""
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.models  # noqa: F401  (register models)
from app.models.problem import Problem, ProblemStarterCode, TestCase
from app.services.starter_code_service import (
    backfill_problem,
    build_starter_codes_map,
    persisted_map_from_rows,
    resolve_signature,
)
from app.judge.stub_generator import SUPPORTED_LANGUAGES


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


def _make_two_sum(db):
    p = Problem(
        id="p-twosum",
        title="Two Sum",
        slug="two-sum",
        difficulty="easy",
        description="...",
        starter_code="class Solution:\n    def twoSum(self, nums, target):\n        pass",
        function_name="twoSum",
        tags_json="[]",
    )
    p.test_cases = [
        TestCase(input="[2, 7, 11, 15]\n9", expected_output="[0, 1]", is_hidden=False, sort_order=0),
    ]
    db.add(p)
    db.commit()
    return p


def test_backfill_creates_nine_rows_and_signature(db):
    p = _make_two_sum(db)
    spec = backfill_problem(db, p)
    db.commit()

    assert spec["function_name"] == "twoSum"
    assert p.signature_json
    rows = db.query(ProblemStarterCode).filter_by(problem_id="p-twosum").all()
    assert {r.language for r in rows} == set(SUPPORTED_LANGUAGES)

    by_lang = {r.language: r.code for r in rows}
    # python row preserves the legacy starter
    assert "def twoSum(self, nums, target)" in by_lang["python"]
    # others generated from inferred spec
    assert "vector<int> twoSum(vector<int>& nums, int target)" in by_lang["cpp"]
    assert "func twoSum(nums []int, target int) []int" in by_lang["go"]


def test_backfill_is_idempotent_and_preserves_custom(db):
    p = _make_two_sum(db)
    backfill_problem(db, p)
    db.commit()

    # Simulate a manual override.
    java_row = db.query(ProblemStarterCode).filter_by(problem_id="p-twosum", language="java").one()
    java_row.code = "// my custom java"
    java_row.is_custom = True
    db.commit()

    # Re-run backfill — must not touch the custom row, must not duplicate rows.
    db.refresh(p)
    backfill_problem(db, p)
    db.commit()

    rows = db.query(ProblemStarterCode).filter_by(problem_id="p-twosum").all()
    assert len(rows) == len(SUPPORTED_LANGUAGES)  # no duplicates
    java_row = db.query(ProblemStarterCode).filter_by(problem_id="p-twosum", language="java").one()
    assert java_row.code == "// my custom java"  # preserved


def test_detached_eager_load_and_schema_validation(db):
    """Mimic get_problem_bundle: eager-load, close session, build map detached."""
    from sqlalchemy.orm import joinedload
    from app.models.schemas import ProblemDetail
    from app.services.starter_code_service import (
        build_starter_codes_map,
        persisted_map_from_rows,
        resolve_signature,
    )

    p = _make_two_sum(db)
    backfill_problem(db, p)
    db.commit()

    # Re-query with eager loads, then expunge to simulate a closed session.
    problem = (
        db.query(Problem)
        .options(joinedload(Problem.test_cases), joinedload(Problem.starter_codes))
        .filter(Problem.id == "p-twosum")
        .one()
    )
    db.expunge_all()  # detach — lazy access would now raise

    # Detached access must work because of the eager loads.
    spec = resolve_signature(
        signature_json=problem.signature_json,
        function_name=problem.function_name,
        starter_code=problem.starter_code,
        test_cases=[{"input": tc.input, "expected_output": tc.expected_output} for tc in problem.test_cases],
    )
    codes = build_starter_codes_map(
        signature=spec,
        persisted=persisted_map_from_rows(problem.starter_codes),
        python_fallback=problem.starter_code,
    )
    assert set(codes) == set(SUPPORTED_LANGUAGES)

    detail = ProblemDetail.model_validate({
        "id": problem.id,
        "slug": problem.slug,
        "title": problem.title,
        "difficulty": "easy",
        "description": "...",
        "starter_code": problem.starter_code,
        "starter_codes": codes,
        "signature": spec,
        "function_name": problem.function_name,
    })
    assert detail.starter_codes["go"].startswith("func twoSum")
    assert detail.signature["function_name"] == "twoSum"


def test_build_map_prefers_persisted_then_generates():
    spec = {
        "function_name": "twoSum",
        "params": [{"name": "nums", "type": "int[]"}, {"name": "target", "type": "int"}],
        "returns": {"type": "int[]"},
    }
    persisted = {"java": "// custom java"}
    m = build_starter_codes_map(signature=spec, persisted=persisted, python_fallback="# legacy py")
    assert set(m) == set(SUPPORTED_LANGUAGES)
    assert m["java"] == "// custom java"          # persisted wins
    assert m["python"] == "# legacy py"           # python fallback
    assert "func twoSum" in m["go"]               # generated
