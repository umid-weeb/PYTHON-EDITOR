from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import models as _models  # noqa: F401
from app.database import Base
from app.models.problem import Problem, TestCase as ProblemTestCase
from app.models.submission import SolvedProblem, Submission, UserStats
from app.models.user import User
import app.services.problem_service as problem_service_module
import app.services.submission_service as submission_service_module
from app.services.problem_service import get_problem_service
from app.services.submission_service import SubmissionService


def _build_problem(problem_id: str) -> Problem:
    return Problem(
        id=problem_id,
        title="Ikki son yig'indisi",
        slug="ikki-son-yigindisi",
        difficulty="easy",
        description="Tavsif",
        input_format="Kirish",
        output_format="Chiqish",
        constraints_text="Cheklov",
        starter_code="class Solution:\n    def solve(self, nums, target):\n        pass\n",
        function_name="solve",
        tags_json='["array"]',
    )
def _make_engine():
    return create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_recover_stale_submissions_completes_backlog_without_duplicate_solves(monkeypatch) -> None:
    engine = _make_engine()
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(submission_service_module, "SessionLocal", Session)
    monkeypatch.setattr(problem_service_module, "SessionLocal", Session)
    get_problem_service.cache_clear()

    with Session() as db:
        user = User(username="recover_me", password_hash="hashed")
        problem = _build_problem("problem-1")
        db.add_all([user, problem])
        db.flush()
        db.add(
            ProblemTestCase(
                problem_id=problem.id,
                input="[2,7,11,15], 9",
                expected_output="[0,1]",
                is_hidden=False,
                sort_order=0,
            )
        )
        created_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.add_all(
            [
                Submission(
                    user_id=user.id,
                    problem_id=problem.id,
                    code="class Solution:\n    def solve(self, nums, target):\n        return [0, 1]\n",
                    language="python",
                    mode="submit",
                    status="pending",
                    case_results_json="[]",
                    created_at=created_at,
                    updated_at=created_at,
                ),
                Submission(
                    user_id=user.id,
                    problem_id=problem.id,
                    code="class Solution:\n    def solve(self, nums, target):\n        return [0, 1]\n",
                    language="python",
                    mode="submit",
                    status="pending",
                    case_results_json="[]",
                    created_at=created_at + timedelta(seconds=5),
                    updated_at=created_at + timedelta(seconds=5),
                ),
            ]
        )
        db.commit()
        user_id = user.id

    service = SubmissionService()
    monkeypatch.setattr(
        service.judge,
        "run_submission",
        lambda problem, code, mode: {
            "verdict": "Accepted",
            "runtime_ms": 12,
            "memory_kb": 128,
            "passed_count": 1,
            "total_count": 1,
            "error_text": None,
            "case_results": [
                {
                    "name": "Test 1",
                    "verdict": "Accepted",
                    "passed": True,
                    "runtime_ms": 12,
                    "memory_kb": 128,
                    "actual_output": "[0,1]",
                    "error": None,
                }
            ],
        },
    )
    monkeypatch.setattr(service, "_run_first_solve_side_effects", lambda **kwargs: None)

    processed = service.recover_stale_submissions(limit=10, stale_after_seconds=0)

    with Session() as db:
        submissions = db.query(Submission).order_by(Submission.id.asc()).all()
        solves = db.query(SolvedProblem).filter(SolvedProblem.user_id == user_id).all()
        stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()

    assert len(processed) == 2
    assert all(submission.status == "completed" for submission in submissions)
    assert all((submission.verdict or "").lower() == "accepted" for submission in submissions)
    assert len(solves) == 1
    assert solves[0].problem_id == "problem-1"
    assert stats is not None
    assert stats.solved_count == 1
    assert stats.easy_solved == 1
