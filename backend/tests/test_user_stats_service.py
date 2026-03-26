from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base
from app.models.problem import Problem
from app.models.submission_stats import SubmissionRecord, UserProgress, UserStats, UserSubmission
from app.models.user import User
from app.services.user_stats_service import user_stats_service


def test_backfill_all_rebuilds_progress_and_stats_from_accepted_submissions(tmp_path) -> None:
    db_path = tmp_path / "stats.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    started_at = datetime.now(timezone.utc) - timedelta(days=1)

    with Session() as db:
        user = User(username="solver", password_hash="hashed")
        problem = Problem(
            id="two-sum",
            title="Two Sum",
            slug="two-sum",
            difficulty="easy",
            description="Find two numbers.",
            input_format="nums, target",
            output_format="indices",
            constraints_text="n >= 2",
            starter_code="def solve():\n    pass\n",
            function_name="solve",
            tags_json='["array"]',
        )
        db.add_all([user, problem])
        db.flush()

        db.add_all(
            [
                SubmissionRecord(
                    external_submission_id="sub-1",
                    user_id=user.id,
                    problem_id=problem.id,
                    code="print(1)",
                    language="python",
                    status="accepted",
                    verdict="Accepted",
                    runtime=41,
                    memory_kb=256,
                    created_at=started_at,
                ),
                SubmissionRecord(
                    external_submission_id="sub-2",
                    user_id=user.id,
                    problem_id=problem.id,
                    code="print(2)",
                    language="python",
                    status="accepted",
                    verdict="Accepted",
                    runtime=18,
                    memory_kb=192,
                    created_at=started_at + timedelta(hours=1),
                ),
                SubmissionRecord(
                    external_submission_id="sub-3",
                    user_id=user.id,
                    problem_id=problem.id,
                    code="print(3)",
                    language="python",
                    status="wrong_answer",
                    verdict="Wrong Answer",
                    runtime=22,
                    memory_kb=224,
                    created_at=started_at + timedelta(hours=2),
                ),
            ]
        )
        db.commit()

        user_stats_service.backfill_all(db)
        db.commit()

        stats = db.query(UserStats).filter(UserStats.user_id == user.id).first()
        progress = db.query(UserProgress).filter(UserProgress.user_id == user.id, UserProgress.problem_id == problem.id).first()
        history_rows = db.query(UserSubmission).filter(UserSubmission.user_id == user.id).all()

        assert stats is not None
        assert stats.solved_count == 1
        assert stats.easy_solved == 1
        assert stats.medium_solved == 0
        assert stats.hard_solved == 0

        assert progress is not None
        assert progress.attempts == 2
        assert progress.best_runtime == 18
        assert progress.best_memory == 192
        assert progress.solved_at == started_at

        assert len(history_rows) == 3
