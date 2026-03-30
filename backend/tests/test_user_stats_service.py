from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base
from app.models.problem import Problem
from app.models.submission import SolvedProblem, Submission
from app.models.user import User
from app.services.profile_service import profile_service
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
def _make_engine():
    return create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_backfill_all_rebuilds_stats_from_solved_problems() -> None:
    engine = _make_engine()
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


def test_ensure_user_stats_fresh_creates_cache_row_when_missing() -> None:
    engine = _make_engine()
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


def test_ensure_user_stats_fresh_backfills_from_accepted_submissions() -> None:
    engine = _make_engine()
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    with Session() as db:
        user = User(username="accepted_only", password_hash="hashed")
        problem = _build_problem(problem_id="p42", slug="two-sum", difficulty="easy")
        db.add_all([user, problem])
        db.flush()

        db.add(
            Submission(
                user_id=user.id,
                problem_id=problem.id,
                code="class Solution:\n    def solve(self):\n        return 1\n",
                language="python",
                mode="submit",
                status="completed",
                verdict="accepted",
                case_results_json="[]",
            )
        )
        db.commit()

        snapshot = user_stats_service.ensure_user_stats_fresh(db, user.id)
        db.commit()

        solves = db.query(SolvedProblem).filter(SolvedProblem.user_id == user.id).all()

        assert len(solves) == 1
        assert solves[0].problem_id == problem.id
        assert snapshot.solved_count == 1
        assert snapshot.easy_solved == 1


def test_leaderboard_rebuild_prefers_real_progress_and_efficiency() -> None:
    engine = _make_engine()
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    with Session() as db:
        leader = User(username="grinder", display_name="Grinder", password_hash="hashed")
        challenger = User(username="finisher", display_name="Finisher", password_hash="hashed")
        db.add_all([leader, challenger])
        db.flush()

        problems = [
            _build_problem(problem_id=f"p{i}", slug=f"problem-{i}", difficulty="easy")
            for i in range(1, 18)
        ]
        db.add_all(problems)
        db.flush()

        for index in range(1, 8):
            db.add(
                Submission(
                    user_id=leader.id,
                    problem_id=f"p{index}",
                    code="print('ok')",
                    language="python",
                    mode="submit",
                    status="completed",
                    verdict="accepted",
                    case_results_json="[]",
                )
            )

        for _ in range(57):
            db.add(
                Submission(
                    user_id=leader.id,
                    problem_id="p1",
                    code="print('wa')",
                    language="python",
                    mode="submit",
                    status="completed",
                    verdict="wrong_answer",
                    case_results_json="[]",
                )
            )

        for index in range(8, 18):
            db.add(
                Submission(
                    user_id=challenger.id,
                    problem_id=f"p{index}",
                    code="print('ok')",
                    language="python",
                    mode="submit",
                    status="completed",
                    verdict="accepted",
                    case_results_json="[]",
                )
            )

        db.add(
            Submission(
                user_id=challenger.id,
                problem_id="p8",
                code="print('wa')",
                language="python",
                mode="submit",
                status="completed",
                verdict="wrong_answer",
                case_results_json="[]",
            )
        )
        db.commit()

        leaderboard = profile_service.get_leaderboard(db, limit=10)

        assert leaderboard[0]["username"] == "finisher"
        assert leaderboard[0]["display_name"] == "Finisher"
        assert leaderboard[0]["solved_count"] == 10
        assert leaderboard[0]["rating"] > leaderboard[1]["rating"]
        assert leaderboard[1]["username"] == "grinder"
        assert leaderboard[1]["solved_count"] == 7
