from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base
from app.models.problem import Problem
from app.models.submission import SolvedProblem
from app.models.user import User
from app.services.user_stats_service import user_stats_service


def _build_problem(*, problem_id: str, slug: str, difficulty: str) -> Problem:
    return Problem(
        id=problem_id,
        title=slug,
        slug=slug,
        difficulty=difficulty,
        description="desc",
        input_format="input",
        output_format="output",
        constraints_text="constraint",
        starter_code="class Solution:\n    def solve(self):\n        pass\n",
        function_name="solve",
        tags_json='["array"]',
    )


def test_backfill_all_rebuilds_stats_from_solved_problems(tmp_path) -> None:
    db_path = tmp_path / "stats.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    with Session() as db:
        user = User(username="solver", password_hash="hashed")
        problems = [
            _build_problem(problem_id="p1", slug="easy-one", difficulty="easy"),
            _build_problem(problem_id="p2", slug="easy-two", difficulty="easy"),
            _build_problem(problem_id="p3", slug="medium-one", difficulty="medium"),
            _build_problem(problem_id="p4", slug="hard-one", difficulty="hard"),
        ]
        db.add(user)
        db.add_all(problems)
        db.flush()

        db.add_all(
            [
                SolvedProblem(user_id=user.id, problem_id="p1"),
                SolvedProblem(user_id=user.id, problem_id="p2"),
                SolvedProblem(user_id=user.id, problem_id="p3"),
                SolvedProblem(user_id=user.id, problem_id="p4"),
            ]
        )
        db.commit()

        user_stats_service.backfill_all(db)
        db.commit()

        snapshot = user_stats_service.ensure_user_stats_fresh(db, user.id)

        assert snapshot.solved_count == 4
        assert snapshot.easy_solved == 2
        assert snapshot.medium_solved == 1
        assert snapshot.hard_solved == 1


def test_ensure_user_stats_fresh_creates_cache_row_when_missing(tmp_path) -> None:
    db_path = tmp_path / "stats_fresh.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    with Session() as db:
        user = User(username="fresh", password_hash="hashed")
        problem = _build_problem(problem_id="p1", slug="easy-one", difficulty="easy")
        db.add_all([user, problem])
        db.flush()
        db.add(SolvedProblem(user_id=user.id, problem_id=problem.id))
        db.commit()

        snapshot = user_stats_service.ensure_user_stats_fresh(db, user.id)
        db.commit()

        assert snapshot.user_id == user.id
        assert snapshot.solved_count == 1
        assert snapshot.easy_solved == 1
        assert snapshot.medium_solved == 0
        assert snapshot.hard_solved == 0
