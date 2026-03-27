from __future__ import annotations

"""
Compatibility aliases for legacy imports.

The production submission system uses the authoritative models in
`app.models.submission`. Older modules may still import names from
`submission_stats`; keeping aliases here avoids metadata clashes while the
service layer is migrated.
"""

from app.models.submission import Submission as SubmissionRecord
from app.models.submission import Submission as UserSubmission
from app.models.submission import SolvedProblem as UserProgress
from app.models.submission import UserStats

__all__ = [
    "SubmissionRecord",
    "SolvedProblem",
    "UserProgress",
    "UserStats",
    "UserSubmission",
]

SolvedProblem = UserProgress
