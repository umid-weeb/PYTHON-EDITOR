from __future__ import annotations

BASE_RATING = 1200

EASY_POINTS = 8
MEDIUM_POINTS = 18
HARD_POINTS = 36
SOLVED_BONUS = 2


def calculate_rating_from_activity(
    *,
    easy_solved: int = 0,
    medium_solved: int = 0,
    hard_solved: int = 0,
    total_submissions: int = 0,
) -> int:
    easy = max(int(easy_solved or 0), 0)
    medium = max(int(medium_solved or 0), 0)
    hard = max(int(hard_solved or 0), 0)
    solved_count = easy + medium + hard
    if solved_count <= 0:
        return BASE_RATING

    weighted_points = (easy * EASY_POINTS) + (medium * MEDIUM_POINTS) + (hard * HARD_POINTS)
    earned_points = weighted_points + (solved_count * SOLVED_BONUS)

    attempts = max(int(total_submissions or 0), solved_count, 1)
    acceptance_rate = solved_count / attempts
    efficiency_multiplier = 0.5 + (0.5 * acceptance_rate)

    return BASE_RATING + int(round(earned_points * efficiency_multiplier))
