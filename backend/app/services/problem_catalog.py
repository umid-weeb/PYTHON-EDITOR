from __future__ import annotations

import json
import logging
import random
import string
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.orm import Session

from app.models.problem import Problem, TestCase
from app.models.contest import Contest, ContestProblem
from datetime import datetime, timedelta, timezone


VISIBLE_CASE_COUNT = 3
HIDDEN_CASE_COUNT = 3
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TestCaseSeed:
    input: str
    expected_output: str
    is_hidden: bool
    sort_order: int


@dataclass(frozen=True)
class ProblemSeed:
    id: str
    title: str
    slug: str
    difficulty: str
    description: str
    input_format: str
    output_format: str
    constraints_text: str
    starter_code: str
    function_name: str
    tags: list[str]
    test_cases: list[TestCaseSeed]


@dataclass(frozen=True)
class SeedSummary:
    total_count: int
    inserted_count: int
    skipped_count: int
    forced: bool


@dataclass(frozen=True)
class TemplateDefinition:
    slug_prefix: str
    build_title: Callable[[int], str]
    difficulty: str
    tags: list[str]
    build_description: Callable[[int], str]
    build_input_format: Callable[[int], str]
    build_output_format: Callable[[int], str]
    build_constraints: Callable[[int], list[str]]
    build_starter_code: Callable[[int], str]
    build_test_cases: Callable[[int], list[TestCaseSeed]]


def build_problem_catalog() -> list[ProblemSeed]:
    catalog: list[ProblemSeed] = []
    for template in _templates():
        for variation_index in range(10):
            slug = f"{template.slug_prefix}-{variation_index + 1:02d}"
            catalog.append(
                ProblemSeed(
                    id=str(uuid5(NAMESPACE_URL, f"https://pyzone.uz/problems/{slug}")),
                    title=template.build_title(variation_index),
                    slug=slug,
                    difficulty=template.difficulty,
                    description=template.build_description(variation_index),
                    input_format=template.build_input_format(variation_index),
                    output_format=template.build_output_format(variation_index),
                    constraints_text="\n".join(template.build_constraints(variation_index)),
                    starter_code=template.build_starter_code(variation_index),
                    function_name="solve",
                    tags=list(template.tags),
                    test_cases=template.build_test_cases(variation_index),
                )
            )
    return catalog


def ensure_problem_catalog_seeded(db: Session) -> SeedSummary:
    total_count = len(build_problem_catalog())
    existing_count = db.query(Problem).count()

    if existing_count >= total_count:
        logger.info("Syncing problem catalog text and metadata...")
        summary = seed_problem_catalog(db, force=False)
        logger.info("%s problems ready.", summary.total_count)
        # Fall through to the common seeding logic below
    else:
        logger.info("Seeding problems...")
        summary = seed_problem_catalog(db, force=False)
        logger.info("%s problems ready.", summary.total_count)
    
    # Always ensure at least one sample contest exists
    ensure_sample_contest_seeded(db)
    
    return summary


def ensure_sample_contest_seeded(db: Session) -> None:
    """Ensure at least one sample contest exists in the database for demonstration."""
    existing = db.query(Contest).first()
    if existing:
        return

    logger.info("Seeding sample contest...")
    try:
        # Create a sample contest starting now and ending in 7 days
        now = datetime.now(timezone.utc)
        contest = Contest(
            id="sample-arena-contest",
            title="Pyzone Arena - Haftalik Musobaqa #1",
            description="Bu Pyzone Arena platformasidagi ilk namunaviy musobaqa. Ishtirok eting va o'z bilimingizni sinab ko'ring!",
            starts_at=now - timedelta(days=1), # Started yesterday
            ends_at=now + timedelta(days=6),   # Ends in 6 days
            is_rated=True
        )
        db.add(contest)
        db.flush()

        # Attach 3 easy/medium problems from the catalog
        problems = db.query(Problem).limit(3).all()
        for i, problem in enumerate(problems):
            db.add(ContestProblem(
                contest_id=contest.id,
                problem_id=problem.id,
                order_num=i + 1,
                points=100 if problem.difficulty == "easy" else 200
            ))
        
        db.commit()
        logger.info("Sample contest seeded successfully.")
    except Exception as e:
        db.rollback()
        logger.warning("Failed to seed sample contest: %s", e)


def seed_problem_catalog(db: Session, *, force: bool = False) -> SeedSummary:
    catalog = build_problem_catalog()

    if force:
        db.query(TestCase).delete()
        db.query(Problem).delete()
        db.commit()

    existing_problems = {problem.slug: problem for problem in db.query(Problem).all()}
    inserted_count = 0
    skipped_count = 0

    for problem_seed in catalog:
        existing_problem = existing_problems.get(problem_seed.slug)
        if existing_problem is not None:
            # Update basic metadata
            existing_problem.title = problem_seed.title
            existing_problem.difficulty = problem_seed.difficulty
            existing_problem.description = problem_seed.description
            existing_problem.input_format = problem_seed.input_format
            existing_problem.output_format = problem_seed.output_format
            existing_problem.constraints_text = problem_seed.constraints_text
            existing_problem.starter_code = problem_seed.starter_code
            existing_problem.function_name = problem_seed.function_name
            existing_problem.tags_json = json.dumps(problem_seed.tags, ensure_ascii=False)
            
            # CRITICAL: Check if test cases are missing (common error in previous builds)
            test_case_count = db.query(TestCase).filter(TestCase.problem_id == existing_problem.id).count()
            if test_case_count == 0:
                logger.info("Seeding missing test cases for existing problem: %s", problem_seed.slug)
                for test_case in problem_seed.test_cases:
                    db.add(
                        TestCase(
                            problem_id=existing_problem.id,
                            input=test_case.input,
                            expected_output=test_case.expected_output,
                            is_hidden=test_case.is_hidden,
                            sort_order=test_case.sort_order,
                        )
                    )
            
            skipped_count += 1
            continue

        try:
            with db.begin_nested():
                problem = Problem(
                    id=problem_seed.id,
                    title=problem_seed.title,
                    slug=problem_seed.slug,
                    difficulty=problem_seed.difficulty,
                    description=problem_seed.description,
                    input_format=problem_seed.input_format,
                    output_format=problem_seed.output_format,
                    constraints_text=problem_seed.constraints_text,
                    starter_code=problem_seed.starter_code,
                    function_name=problem_seed.function_name,
                    tags_json=json.dumps(problem_seed.tags, ensure_ascii=False),
                )
                db.add(problem)
                db.flush()

                for test_case in problem_seed.test_cases:
                    db.add(
                        TestCase(
                            problem_id=problem.id,
                            input=test_case.input,
                            expected_output=test_case.expected_output,
                            is_hidden=test_case.is_hidden,
                            sort_order=test_case.sort_order,
                        )
                    )

            inserted_count += 1
        except Exception as e:
            from sqlalchemy.exc import IntegrityError
            if isinstance(e, IntegrityError):
                logger.info("Skipping duplicate problem %s: already exists", problem_seed.slug)
            else:
                logger.warning("Failed to insert problem %s: %s", problem_seed.slug, e)
            skipped_count += 1

    db.commit()
    return SeedSummary(
        total_count=len(catalog),
        inserted_count=inserted_count,
        skipped_count=skipped_count,
        forced=force,
    )


@lru_cache(maxsize=1)
def build_problem_order_map() -> dict[str, int]:
    return {
        problem_seed.slug: index
        for index, problem_seed in enumerate(build_problem_catalog(), start=1)
    }


def _serialize_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _serialize_args(*args: Any) -> str:
    return "\n".join(_serialize_value(arg) for arg in args)


def _starter(signature: str) -> str:
    return "class Solution:\n" f"    def solve(self, {signature}):\n" "        pass\n"


def _problem_description(
    *,
    title: str,
    summary: str,
    steps: list[str],
    examples: list[str],
    notes: list[str],
) -> str:
    lines = [f"## {title}", "", summary, "", "### Vazifa", ""]
    lines.extend(f"- {step}" for step in steps)
    lines.extend(["", "### Misollar", ""])
    lines.extend(examples)
    lines.extend(["", "### Eslatmalar", ""])
    lines.extend(f"- {note}" for note in notes)
    return "\n".join(lines)


def _mk_cases(
    solver: Callable[..., Any],
    argument_builder: Callable[[random.Random, int], tuple[Any, ...]],
    *,
    seed_prefix: int,
) -> list[TestCaseSeed]:
    cases: list[TestCaseSeed] = []
    for index in range(VISIBLE_CASE_COUNT + HIDDEN_CASE_COUNT):
        rng = random.Random(seed_prefix * 100 + index)
        args = argument_builder(rng, index)
        cases.append(
            TestCaseSeed(
                input=_serialize_args(*args),
                expected_output=_serialize_value(solver(*args)),
                is_hidden=index >= VISIBLE_CASE_COUNT,
                sort_order=index,
            )
        )
    return cases


def _divisible_sum_solver(nums: list[int], divisor: int) -> int:
    return sum(value for value in nums if value % divisor == 0)


def _char_count_solver(text: str, target_chars: str) -> int:
    allowed = set(target_chars.lower())
    return sum(1 for char in text.lower() if char in allowed)


def _distinct_sort_solver(nums: list[int], descending: bool) -> list[int]:
    return sorted(set(nums), reverse=descending)


def _balanced_brackets_solver(text: str) -> bool:
    pairs = {")": "(", "]": "[", "}": "{"}
    openings = set(pairs.values())
    stack: list[str] = []
    for char in text:
        if char in openings:
            stack.append(char)
        elif char in pairs:
            if not stack or stack.pop() != pairs[char]:
                return False
    return not stack


def _clean_palindrome_solver(text: str, letters_only: bool) -> bool:
    cleaned = "".join(char.lower() for char in text if char.isalpha() or (not letters_only and char.isdigit()))
    return cleaned == cleaned[::-1]


def _pair_sum_solver(nums: list[int], target: int) -> list[int]:
    lookup: dict[int, int] = {}
    for index, value in enumerate(nums):
        needed = target - value
        if needed in lookup:
            return [lookup[needed], index]
        if value not in lookup:
            lookup[value] = index
    return [-1, -1]


def _lower_bound_solver(nums: list[int], target: int) -> int:
    left = 0
    right = len(nums)
    while left < right:
        middle = (left + right) // 2
        if nums[middle] < target:
            left = middle + 1
        else:
            right = middle
    return left


def _frequency_leader_solver(nums: list[int]) -> int:
    counts: dict[int, int] = {}
    for value in nums:
        counts[value] = counts.get(value, 0) + 1
    return min(counts, key=lambda value: (-counts[value], value))


def _climb_ways_solver(n: int, max_step: int) -> int:
    dp = [0] * (max(1, n) + 1)
    dp[0] = 1
    for step in range(1, n + 1):
        dp[step] = sum(dp[step - jump] for jump in range(1, max_step + 1) if step - jump >= 0)
    return dp[n]


def _longest_unique_solver(text: str) -> int:
    seen: dict[str, int] = {}
    left = 0
    best = 0
    for right, char in enumerate(text):
        if char in seen and seen[char] >= left:
            left = seen[char] + 1
        seen[char] = right
        best = max(best, right - left + 1)
    return best


def _edit_distance_solver(left_text: str, right_text: str) -> int:
    rows = len(left_text) + 1
    cols = len(right_text) + 1
    dp = [[0] * cols for _ in range(rows)]
    for row in range(rows):
        dp[row][0] = row
    for col in range(cols):
        dp[0][col] = col
    for row in range(1, rows):
        for col in range(1, cols):
            if left_text[row - 1] == right_text[col - 1]:
                dp[row][col] = dp[row - 1][col - 1]
            else:
                dp[row][col] = 1 + min(dp[row - 1][col], dp[row][col - 1], dp[row - 1][col - 1])
    return dp[-1][-1]


def _trap_water_solver(heights: list[int]) -> int:
    left = 0
    right = len(heights) - 1
    left_max = 0
    right_max = 0
    total = 0
    while left < right:
        if heights[left] <= heights[right]:
            left_max = max(left_max, heights[left])
            total += left_max - heights[left]
            left += 1
        else:
            right_max = max(right_max, heights[right])
            total += right_max - heights[right]
            right -= 1
    return total


def _random_text(rng: random.Random, min_size: int, max_size: int, alphabet: str | None = None) -> str:
    source = alphabet or (string.ascii_lowercase + "     ")
    text = "".join(rng.choice(source) for _ in range(rng.randint(min_size, max_size)))
    return " ".join(text.split()) or "code"


def _random_bracket_text(rng: random.Random, length: int) -> str:
    return "".join(rng.choice("()[]{}abcxyz") for _ in range(length))


def _pair_sum_args(rng: random.Random, case_index: int) -> tuple[list[int], int]:
    if case_index == 0:
        return [2, 7, 11, 15], 9

    size = rng.randint(6, 10)
    nums = [rng.randint(-15, 25) for _ in range(size)]
    if case_index % 2 == 0:
        left = rng.randint(0, size - 2)
        right = rng.randint(left + 1, size - 1)
        target = nums[left] + nums[right]
    else:
        target = 1000 + case_index
    return nums, target


def _lower_bound_args(rng: random.Random, case_index: int) -> tuple[list[int], int]:
    if case_index == 0:
        return [1, 3, 3, 5], 3

    nums = sorted(rng.randint(-20, 30) for _ in range(rng.randint(6, 12)))
    target = rng.randint(-22, 32)
    return nums, target


def _edit_distance_args(rng: random.Random, case_index: int) -> tuple[str, str]:
    if case_index == 0:
        return "uy", "suy"
    if case_index == 1:
        return "olma", "olma"

    left_size = rng.randint(4, 8)
    right_size = rng.randint(4, 8)
    alphabet = "abcdeilmnoprstuvxyz"
    return (
        "".join(rng.choice(alphabet) for _ in range(left_size)),
        "".join(rng.choice(alphabet) for _ in range(right_size)),
    )


def _templates() -> list[TemplateDefinition]:
    char_sets = ["aeiou", "salom", "kitob", "mantiq", "navbat", "stek", "daryo", "osmon", "raqam", "oqim"]

    return [
        TemplateDefinition(
            slug_prefix="divisible-sum",
            build_title=lambda index: f"{index + 2} ga bo'linadigan sonlar yig'indisi",
            difficulty="easy",
            tags=["array", "math"],
            build_description=lambda index: _problem_description(
                title=f"{index + 2} ga bo'linadigan sonlar yig'indisi",
                summary=f"Sizga butun sonlardan iborat massiv beriladi. {index + 2} ga bo'linadigan barcha qiymatlar yig'indisini qaytaring.",
                steps=[
                    "Massivdagi har bir sonni tekshiring.",
                    f"{index + 2} ga bo'linadigan qiymatlarni ajrating.",
                    "Ularning umumiy yig'indisini bitta butun son sifatida qaytaring.",
                ],
                examples=[
                    f"- Agar nums = [3, 6, 7, 9] bo'lsa, {index + 2} ga bo'linadigan sonlargina javobga qo'shiladi.",
                    "- Mos qiymat topilmasa, javob 0 bo'ladi.",
                ],
                notes=["Manfiy sonlar ham bo'linishi mumkin.", "Massivda takroriy qiymatlar bo'lishi mumkin."],
            ),
            build_input_format=lambda index: "nums: butun sonlardan iborat ro'yxat",
            build_output_format=lambda index: "Shartga mos sonlar yig'indisini qaytaring.",
            build_constraints=lambda index: [
                "1 <= nums dagi elementlar soni <= 200",
                "-1000 <= nums[i] <= 1000",
                f"Bu variantdagi bo'luvchi {index + 2}.",
            ],
            build_starter_code=lambda index: _starter("nums"),
            build_test_cases=lambda index: _mk_cases(
                lambda nums: _divisible_sum_solver(nums, index + 2),
                lambda rng, _: ([rng.randint(-40, 80) for _ in range(rng.randint(6, 10))],),
                seed_prefix=100 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="pattern-char-count",
            build_title=lambda index: f'"{char_sets[index]}" to\'plamidagi belgilar soni',
            difficulty="easy",
            tags=["string", "hashmap"],
            build_description=lambda index: _problem_description(
                title=f'"{char_sets[index]}" to\'plamidagi belgilar soni',
                summary=f'Berilgan matnda "{char_sets[index]}" to\'plamiga kiradigan belgilar necha marta uchrashini toping.',
                steps=[
                    "Katta va kichik harflarni bir xil deb oling.",
                    "Mos keladigan har bir belgi uchrashuvini sanang.",
                    "Yakuniy sonni qaytaring.",
                ],
                examples=[
                    '- "Salom" matnida "ao" to\'plami uchun 2 ta mos belgi bor.',
                    "- Belgilar to'plamiga kirmaydigan belgilarga e'tibor berilmaydi.",
                ],
                notes=["Belgilar to'plami bu masala uchun oldindan berilgan.", "Matnda bo'shliqlar bo'lishi mumkin."],
            ),
            build_input_format=lambda index: "text: matn",
            build_output_format=lambda index: "Mos kelgan belgilar sonini qaytaring.",
            build_constraints=lambda index: [
                "1 <= text uzunligi <= 300",
                f'Bu variantdagi belgilar to\'plami "{char_sets[index]}".',
            ],
            build_starter_code=lambda index: _starter("text"),
            build_test_cases=lambda index: _mk_cases(
                lambda text: _char_count_solver(text, char_sets[index]),
                lambda rng, _: (_random_text(rng, 18, 42, string.ascii_letters + "     "),),
                seed_prefix=200 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="distinct-sort",
            build_title=lambda index: f'Takrorlarsiz saralash ({"o'sish" if index % 2 == 0 else "kamayish"} tartibida)',
            difficulty="easy",
            tags=["sorting", "array"],
            build_description=lambda index: _problem_description(
                title=f'Takrorlarsiz saralash ({"o'sish" if index % 2 == 0 else "kamayish"} tartibida)',
                summary="Massivdagi takroriy butun sonlarni olib tashlang va qolgan qiymatlarni berilgan tartibda qaytaring.",
                steps=[
                    "Har bir butun sondan faqat bittasini qoldiring.",
                    "Noyob qiymatlarni saralang.",
                    f'Ularni {"o'sish" if index % 2 == 0 else "kamayish"} tartibida qaytaring.',
                ],
                examples=[
                    "- [4, 1, 4, 2] o'sish tartibida [1, 2, 4] bo'ladi.",
                    "- [4, 1, 4, 2] kamayish tartibida [4, 2, 1] bo'ladi.",
                ],
                notes=["Saralash tartibi butun masala uchun oldindan berilgan.", "Natija ro'yxat ko'rinishida qaytishi kerak."],
            ),
            build_input_format=lambda index: "nums: butun sonlardan iborat ro'yxat",
            build_output_format=lambda index: "Noyob va saralangan ro'yxatni qaytaring.",
            build_constraints=lambda index: [
                "1 <= nums dagi elementlar soni <= 150",
                "-500 <= nums[i] <= 500",
                f'Bu variantda {"o'sish" if index % 2 == 0 else "kamayish"} tartibi ishlatiladi.',
            ],
            build_starter_code=lambda index: _starter("nums"),
            build_test_cases=lambda index: _mk_cases(
                lambda nums: _distinct_sort_solver(nums, bool(index % 2)),
                lambda rng, _: ([rng.randint(-20, 20) for _ in range(rng.randint(6, 12))],),
                seed_prefix=300 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="balanced-brackets-lite",
            build_title=lambda index: "Qavslar muvozanati",
            difficulty="easy",
            tags=["stack", "string"],
            build_description=lambda index: _problem_description(
                title="Qavslar muvozanati",
                summary="Agar har bir ochilgan qavs to'g'ri tartibda yopilgan bo'lsa, rost qaytaring.",
                steps=[
                    "(), [] va {} qavslarini ko'rib chiqing.",
                    "Qavs bo'lmagan belgilarni e'tiborga olmang.",
                    "Rost yoki yolg'on javob qaytaring.",
                ],
                examples=[
                    '- "()[]{}" to\'g\'ri ketma-ketlik hisoblanadi.',
                    '- "([)]" noto\'g\'ri, chunki yopilish tartibi xato.',
                ],
                notes=["Stek usuli bu yerda juda qulay.", "Bo'sh samarali ketma-ketlik ham to'g'ri hisoblanadi."],
            ),
            build_input_format=lambda index: "text: satr",
            build_output_format=lambda index: "Rost yoki yolg'on qiymat qaytaring.",
            build_constraints=lambda index: [
                "1 <= text uzunligi <= 200",
                "Natijaga faqat qavs belgilarigina ta'sir qiladi.",
            ],
            build_starter_code=lambda index: _starter("text"),
            build_test_cases=lambda index: _mk_cases(
                _balanced_brackets_solver,
                lambda rng, case_index: (
                    (
                        "()[]{}"
                        if case_index == 0
                        else "([{}])abc"
                        if case_index == 1
                        else _random_bracket_text(rng, rng.randint(8, 20))
                    ),
                ),
                seed_prefix=400 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="clean-palindrome-check",
            build_title=lambda index: f'Palindromni tekshirish ({"faqat harflar" if index % 2 else "harflar va raqamlar"})',
            difficulty="easy",
            tags=["two-pointers", "string"],
            build_description=lambda index: _problem_description(
                title=f'Palindromni tekshirish ({"faqat harflar" if index % 2 else "harflar va raqamlar"})',
                summary=(
                    "Matnni tozalang va u chapdan o'ngga ham, o'ngdan chapga ham bir xil o'qilishini tekshiring. "
                    f'Bu variantda {"faqat harflar" if index % 2 else "harflar va raqamlar"} saqlanadi.'
                ),
                steps=[
                    "Bo'shliqlar va tinish belgilarini e'tiborga olmang.",
                    f'Tozalashda {"faqat harflarni" if index % 2 else "harflar va raqamlarni"} qoldiring.',
                    "Tozalangan satrni uning teskarisi bilan solishtiring.",
                ],
                examples=[
                    '- "alla" palindrom hisoblanadi.',
                    '- "salom" palindrom emas.',
                ],
                notes=["Katta-kichik harf farqi muhim emas.", "Rost yoki yolg'on qiymat qaytaring."],
            ),
            build_input_format=lambda index: "text: satr",
            build_output_format=lambda index: "Rost yoki yolg'on qiymat qaytaring.",
            build_constraints=lambda index: [
                "1 <= text uzunligi <= 250",
                f'Bu variantda {"faqat harflar" if index % 2 else "harflar va raqamlar"} saqlanadi.',
            ],
            build_starter_code=lambda index: _starter("text"),
            build_test_cases=lambda index: _mk_cases(
                lambda text: _clean_palindrome_solver(text, bool(index % 2)),
                lambda rng, case_index: (
                    (
                        "alla"
                        if case_index == 0
                        else "Qiziq 202"
                        if case_index == 1
                        else _random_text(rng, 12, 30, string.ascii_letters + string.digits + " ,.:;!?")
                    ),
                ),
                seed_prefix=500 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="pair-sum-indices",
            build_title=lambda index: "Ikki son yig'indisi",
            difficulty="medium",
            tags=["two-pointers", "hashmap"],
            build_description=lambda index: _problem_description(
                title="Ikki son yig'indisi",
                summary="Qiymatlari target ga teng bo'ladigan yig'indini hosil qiluvchi birinchi indekslar juftligini qaytaring.",
                steps=[
                    "Massivni chapdan o'ngga qarab ko'rib chiqing.",
                    "Birinchi topilgan to'g'ri juftlikni [i, j] ko'rinishida qaytaring.",
                    "Agar bunday juftlik bo'lmasa, [-1, -1] qaytaring.",
                ],
                examples=[
                    "- nums = [2, 7, 11, 15], target = 9 bo'lsa, javob [0, 1] bo'ladi.",
                    "- nums = [1, 2, 3], target = 8 bo'lsa, javob [-1, -1] bo'ladi.",
                ],
                notes=["Har doim yagona javob bo'lishi shart emas.", "Chapdan o'ngga yurishda birinchi topilgan juftlik afzal."],
            ),
            build_input_format=lambda index: "nums: butun sonlar ro'yxati\ntarget: butun son",
            build_output_format=lambda index: "Uzunligi 2 bo'lgan indekslar ro'yxatini qaytaring.",
            build_constraints=lambda index: [
                "2 <= nums dagi elementlar soni <= 250",
                "-10^4 <= nums[i], target <= 10^4",
            ],
            build_starter_code=lambda index: _starter("nums, target"),
            build_test_cases=lambda index: _mk_cases(
                _pair_sum_solver,
                lambda rng, case_index: _pair_sum_args(rng, case_index),
                seed_prefix=600 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="lower-bound-search",
            build_title=lambda index: "Birinchi mos indeks",
            difficulty="medium",
            tags=["binary-search", "array"],
            build_description=lambda index: _problem_description(
                title="Birinchi mos indeks",
                summary="Saralangan massivda target dan katta yoki unga teng bo'lgan birinchi qiymat indeksini qaytaring.",
                steps=[
                    "Massiv saralanganidan foydalaning.",
                    "Agar barcha qiymatlar target dan kichik bo'lsa, nums uzunligini qaytaring.",
                    "Massivda takroriy qiymatlar bo'lishi mumkin.",
                ],
                examples=[
                    "- nums = [1, 3, 3, 5], target = 3 bo'lsa, javob 1 bo'ladi.",
                    "- nums = [1, 3, 3, 5], target = 4 bo'lsa, javob 3 bo'ladi.",
                ],
                notes=["Bu klassik quyi chegara masalasi.", "Ikkilik qidiruv tavsiya etiladi."],
            ),
            build_input_format=lambda index: "nums: o'sish tartibida saralangan butun sonlar ro'yxati\ntarget: butun son",
            build_output_format=lambda index: "Bitta indeksni qaytaring.",
            build_constraints=lambda index: [
                "1 <= nums dagi elementlar soni <= 300",
                "-10^4 <= nums[i], target <= 10^4",
            ],
            build_starter_code=lambda index: _starter("nums, target"),
            build_test_cases=lambda index: _mk_cases(
                _lower_bound_solver,
                lambda rng, case_index: _lower_bound_args(rng, case_index),
                seed_prefix=700 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="frequency-leader",
            build_title=lambda index: "Eng ko'p uchraydigan son",
            difficulty="medium",
            tags=["hashmap", "sorting"],
            build_description=lambda index: _problem_description(
                title="Eng ko'p uchraydigan son",
                summary="Eng ko'p marta uchraydigan qiymatni qaytaring. Tenglik bo'lsa, eng kichigini tanlang.",
                steps=[
                    "Har bir butun son necha marta uchrashini sanang.",
                    "Eng katta takrorlanish sonini toping.",
                    "Bir nechta qiymat teng bo'lsa, eng kichigini qaytaring.",
                ],
                examples=[
                    "- [4, 4, 2, 2, 2, 7] uchun javob 2 bo'ladi.",
                    "- [5, 5, 1, 1] uchun tenglik qoidasi sabab javob 1 bo'ladi.",
                ],
                notes=["Massivda kamida bitta son bo'ladi.", "Xesh-jadval asosidagi sanash juda qulay."],
            ),
            build_input_format=lambda index: "nums: butun sonlar ro'yxati",
            build_output_format=lambda index: "Bitta butun sonni qaytaring.",
            build_constraints=lambda index: [
                "1 <= nums dagi elementlar soni <= 250",
                "-1000 <= nums[i] <= 1000",
            ],
            build_starter_code=lambda index: _starter("nums"),
            build_test_cases=lambda index: _mk_cases(
                _frequency_leader_solver,
                lambda rng, _: ([rng.randint(0, 8) for _ in range(rng.randint(8, 16))],),
                seed_prefix=800 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="climbing-ways",
            build_title=lambda index: f"Zinaga chiqish usullari ({2 + (index % 2)} qadamgacha)",
            difficulty="medium",
            tags=["dynamic-programming", "recursion"],
            build_description=lambda index: _problem_description(
                title=f"Zinaga chiqish usullari ({2 + (index % 2)} qadamgacha)",
                summary=f"Har bir yurishda 1 tadan {2 + (index % 2)} tagacha qadam tashlash mumkin bo'lsa, n pog'onaga nechta turli usul bilan chiqish mumkinligini toping.",
                steps=[
                    "Boshlanish nuqtasi 0-pog'ona deb olinadi.",
                    f"Har yurishda 1 tadan {2 + (index % 2)} tagacha qadam tashlash mumkin.",
                    "Aynan n pog'onaga tushadigan barcha usullar sonini qaytaring.",
                ],
                examples=[
                    "- n = 4 va yurish 1..2 bo'lsa, javob 5 bo'ladi.",
                    "- Katta n qiymatlarida dinamik dasturlash juda foydali.",
                ],
                notes=["Qadamlar ketma-ketligi muhim.", "Butun son ko'rinishidagi javob qaytaring."],
            ),
            build_input_format=lambda index: "n: pog'onalar soni",
            build_output_format=lambda index: "Bitta butun sonni qaytaring.",
            build_constraints=lambda index: [
                "1 <= n <= 25",
                f"Bu variantda bir yurishda 1 tadan {2 + (index % 2)} tagacha qadam tashlash mumkin.",
            ],
            build_starter_code=lambda index: _starter("n"),
            build_test_cases=lambda index: _mk_cases(
                lambda n: _climb_ways_solver(n, 2 + (index % 2)),
                lambda rng, case_index: ((case_index + 3 + rng.randint(0, 6)),),
                seed_prefix=900 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="longest-unique-window",
            build_title=lambda index: "Takrorlanmas eng uzun qism",
            difficulty="medium",
            tags=["string", "sliding-window"],
            build_description=lambda index: _problem_description(
                title="Takrorlanmas eng uzun qism",
                summary="Takroriy belgilar qatnashmaydigan eng uzun qism uzunligini qaytaring.",
                steps=[
                    "Matnni chapdan o'ngga qarab ko'rib chiqing.",
                    "To'g'ri qism ichida bir xil belgi takrorlanmasligi kerak.",
                    "Eng yaxshi uzunlikni qaytaring.",
                ],
                examples=[
                    '- "abca" uchun javob 3 bo\'ladi.',
                    '- "aaaa" uchun javob 1 bo\'ladi.',
                ],
                notes=["Bo'sh joy ham belgi hisoblanadi.", "Bo'sh satr uchun javob 0 bo'lar edi, lekin bu to'plamda bo'sh satr berilmaydi."],
            ),
            build_input_format=lambda index: "text: satr",
            build_output_format=lambda index: "Uzunlikni butun son sifatida qaytaring.",
            build_constraints=lambda index: [
                "1 <= text uzunligi <= 200",
                "Belgilar ko'p marta takrorlanishi mumkin.",
            ],
            build_starter_code=lambda index: _starter("text"),
            build_test_cases=lambda index: _mk_cases(
                _longest_unique_solver,
                lambda rng, case_index: (
                    (
                        "abcabcbb"
                        if case_index == 0
                        else "bbbbb"
                        if case_index == 1
                        else _random_text(rng, 10, 28, string.ascii_lowercase + " ")
                    ),
                ),
                seed_prefix=1000 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="edit-distance-grid",
            build_title=lambda index: "Tahrirlash masofasi",
            difficulty="hard",
            tags=["dynamic-programming", "string"],
            build_description=lambda index: _problem_description(
                title="Tahrirlash masofasi",
                summary="Birinchi satrni ikkinchi satrga aylantirish uchun kerak bo'ladigan eng kam qo'shish, o'chirish va almashtirishlar sonini toping.",
                steps=[
                    "Bitta belgini qo'shish mumkin.",
                    "Bitta belgini o'chirish mumkin.",
                    "Bitta belgini boshqa belgi bilan almashtirish mumkin.",
                ],
                examples=[
                    '- "uy" -> "suy" uchun 1 ta qo\'shish kifoya.',
                    "- Bir xil satrlar uchun javob 0 bo'ladi.",
                ],
                notes=["Asosiy yondashuv dinamik dasturlashdir.", "Eng kichik tahrirlar sonini qaytaring."],
            ),
            build_input_format=lambda index: "left_text: birinchi satr\nright_text: ikkinchi satr",
            build_output_format=lambda index: "Bitta butun sonni qaytaring.",
            build_constraints=lambda index: [
                "1 <= left_text va right_text uzunligi <= 40",
                "Kirish satrlari kichik lotin harflaridan iborat bo'ladi.",
            ],
            build_starter_code=lambda index: _starter("left_text, right_text"),
            build_test_cases=lambda index: _mk_cases(
                _edit_distance_solver,
                lambda rng, case_index: _edit_distance_args(rng, case_index),
                seed_prefix=1100 + index,
            ),
        ),
        TemplateDefinition(
            slug_prefix="trapped-rain-collector",
            build_title=lambda index: "Yig'ilgan yomg'ir suvi",
            difficulty="hard",
            tags=["array", "two-pointers", "stack"],
            build_description=lambda index: _problem_description(
                title="Yig'ilgan yomg'ir suvi",
                summary="Balandliklar massivi berilganda, yomg'irdan keyin qancha suv yig'ilishini toping.",
                steps=[
                    "Har bir qiymat ustun balandligini bildiradi.",
                    "Suv balandroq chegaralar orasida yig'ilishi mumkin.",
                    "Yig'ilgan suvning umumiy hajmini qaytaring.",
                ],
                examples=[
                    "- [0,1,0,2,1,0,1,3,2,1,2,1] uchun javob 6 bo'ladi.",
                    "- To'liq o'sib boruvchi balandliklar suv ushlamaydi.",
                ],
                notes=["Ikki ko'rsatkichli yechim chiziqli vaqtda ishlaydi.", "Bitta butun sonni qaytaring."],
            ),
            build_input_format=lambda index: "heights: balandliklar ro'yxati",
            build_output_format=lambda index: "Bitta butun sonni qaytaring.",
            build_constraints=lambda index: [
                "1 <= heights dagi elementlar soni <= 120",
                "0 <= heights[i] <= 20",
            ],
            build_starter_code=lambda index: _starter("heights"),
            build_test_cases=lambda index: _mk_cases(
                _trap_water_solver,
                lambda rng, case_index: (
                    (
                        [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]
                        if case_index == 0
                        else [rng.randint(0, 8) for _ in range(rng.randint(8, 16))]
                    ),
                ),
                seed_prefix=1200 + index,
            ),
        ),
    ]
