"""
Barcha pending/running submissionlarni qayta ishga tushiradi.
Ishlatish: cd backend && python scripts/requeue_pending.py
"""
from __future__ import annotations
import sys
from pathlib import Path

# Add backend root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models.submission import Submission
from app.services.submission_service import get_submission_service


def main() -> None:
    service = get_submission_service()
    with SessionLocal() as db:
        rows = (
            db.query(Submission.id, Submission.status, Submission.created_at)
            .filter(Submission.status.in_(["pending", "running"]))
            .order_by(Submission.created_at.asc())
            .limit(200)
            .all()
        )
        print(f"Topildi: {len(rows)} ta pending/running submission")

        if not rows:
            print("Hamma narsa yaxshi — pending submission yo'q.")
            return

        for (sid, status, created_at) in rows:
            print(f"\n  → id={sid}  status={status}  created={created_at}")
            try:
                service.process_submission(str(sid), recover_stale=True)
                print(f"    ✓ Qayta ishlandi")
            except Exception as e:  # noqa: BLE001
                print(f"    ✗ Xato: {e}")

    print("\nTugadi.")


if __name__ == "__main__":
    main()
