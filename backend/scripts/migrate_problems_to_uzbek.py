from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from app.database import SessionLocal, engine
from app.services.problem_catalog import build_problem_catalog

try:
    import redis
except Exception:  # pragma: no cover
    redis = None


ENGLISH_MARKER_RE = re.compile(
    r"\b("
    r"given|return|input|output|example|constraints|array|string|integer|number|sum|search|"
    r"substring|palindrome|parentheses|regex|roman|median|convert|reverse|sorted|list|match|"
    r"container|water|stock|anagram|merge|window|character"
    r")\b",
    flags=re.IGNORECASE,
)


MANUAL_FALLBACKS: dict[str, dict[str, Any]] = {
    "two-sum": {
        "leetcode_id": 1,
        "title": "Ikki son yig'indisi",
        "description": "Butun sonlar massivi va target beriladi. Yig'indisi target ga teng bo'ladigan ikkita turli element indekslarini toping.",
        "input_format": "nums: butun sonlar massivi\ntarget: butun son",
        "output_format": "Ikkita indeksni ro'yxat ko'rinishida qaytaring.",
        "constraints": "Har bir kirish uchun kamida bitta yechim mavjud.",
    },
    "add-two-numbers": {
        "leetcode_id": 2,
        "title": "Ikkita sonni qo'shish",
        "description": "Ikkita bog'langan ro'yxat sonlarni teskari tartibdagi raqamlar sifatida saqlaydi. Ularni qo'shib, natijani shu ko'rinishdagi bog'langan ro'yxat sifatida qaytaring.",
        "input_format": "l1 va l2: bog'langan ro'yxatlar",
        "output_format": "Yig'indini ifodalovchi bog'langan ro'yxatni qaytaring.",
        "constraints": "Har bir tugun bitta raqamni ifodalaydi.",
    },
    "longest-substring-without-repeating-characters": {
        "leetcode_id": 3,
        "title": "Takrorlanmaydigan eng uzun qism",
        "description": "Berilgan satr ichida takroriy belgilar qatnashmaydigan eng uzun qismning uzunligini toping.",
        "input_format": "s: satr",
        "output_format": "Uzunlikni butun son sifatida qaytaring.",
        "constraints": "Qism ichida bir xil belgi ikki marta uchramasligi kerak.",
    },
    "median-of-two-sorted-arrays": {
        "leetcode_id": 4,
        "title": "Ikkita saralangan massiv medianasi",
        "description": "Ikkita saralangan massiv beriladi. Ularni birlashtirmasdan umumiy medianani toping.",
        "input_format": "nums1 va nums2: saralangan massivlar",
        "output_format": "Medianani haqiqiy son sifatida qaytaring.",
        "constraints": "Algoritmning vaqt murakkabligi logarifmik bo'lishi kerak.",
    },
    "longest-palindromic-substring": {
        "leetcode_id": 5,
        "title": "Eng uzun palindrom qism",
        "description": "Berilgan satr ichidan palindrom bo'lgan eng uzun qismni toping.",
        "input_format": "s: satr",
        "output_format": "Eng uzun palindrom qismni qaytaring.",
        "constraints": "Bir nechta javob bo'lsa, ulardan istalgani qabul qilinadi.",
    },
    "zigzag-conversion": {
        "leetcode_id": 6,
        "title": "Zigzag ko'rinishiga o'tkazish",
        "description": "Satrni berilgan qatorlar soniga ko'ra zigzag ko'rinishida yozing va keyin qatorma-qator o'qilgan natijani qaytaring.",
        "input_format": "s: satr\nnum_rows: qatorlar soni",
        "output_format": "Qayta tuzilgan satrni qaytaring.",
        "constraints": "Qatorlar soni 1 bo'lsa, satr o'zgarmaydi.",
    },
    "reverse-integer": {
        "leetcode_id": 7,
        "title": "Butun sonni teskari aylantirish",
        "description": "32-bit ishorali butun son beriladi. Uning raqamlarini teskari aylantiring. Agar natija diapazondan chiqsa, 0 qaytaring.",
        "input_format": "x: butun son",
        "output_format": "Teskari aylantirilgan butun sonni qaytaring.",
        "constraints": "32-bit signed integer oralig'idan chiqish mumkin emas.",
    },
    "string-to-integer-atoi": {
        "leetcode_id": 8,
        "title": "Satrni butun songa aylantirish",
        "description": "Satr boshidagi bo'shliqlarni e'tiborsiz qoldirib, ishora va raqamlarni o'qib butun songa aylantiring. Diapazon oshsa, chegaraviy qiymatni qaytaring.",
        "input_format": "s: satr",
        "output_format": "Butun sonni qaytaring.",
        "constraints": "Faqat boshlang'ich yaroqli prefiks o'qiladi.",
    },
    "palindrome-number": {
        "leetcode_id": 9,
        "title": "Palindrom son",
        "description": "Butun son chapdan ham, o'ngdan ham bir xil o'qilsa, palindrom hisoblanadi. Son palindrom ekanini aniqlang.",
        "input_format": "x: butun son",
        "output_format": "Rost yoki yolg'on qiymat qaytaring.",
        "constraints": "Manfiy sonlar palindrom bo'lmaydi.",
    },
    "regular-expression-matching": {
        "leetcode_id": 10,
        "title": "Muntazam ifodalarni moslashtirish",
        "description": "Satr beriladi va andoza beriladi. Andozadagi '.' istalgan bitta belgiga, '*' esa undan oldingi belgining ixtiyoriy soniga mos keladi. To'liq moslikni tekshiring.",
        "input_format": "s: satr\np: andoza",
        "output_format": "Rost yoki yolg'on qiymat qaytaring.",
        "constraints": "Moslik butun satr bo'yicha tekshiriladi.",
    },
}


@dataclass
class PreparedProblem:
    id: str
    slug: str
    title: str
    description: str
    input_format: str | None
    output_format: str | None
    constraints: str | None
    leetcode_id: int | None


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    replacements = {
        "â€˜": "'",
        "â€™": "'",
        "â€œ": '"',
        "â€": '"',
        "â€“": "-",
        "â€”": "-",
    }
    for source, target in replacements.items():
        text_value = text_value.replace(source, target)
    return text_value


def create_backup_and_columns(recreate_backup: bool) -> None:
    statements = [
        "ALTER TABLE problems ADD COLUMN IF NOT EXISTS leetcode_id INTEGER",
        "ALTER TABLE problems ADD COLUMN IF NOT EXISTS title_uz TEXT",
        "ALTER TABLE problems ADD COLUMN IF NOT EXISTS description_uz TEXT",
        "CREATE INDEX IF NOT EXISTS idx_problems_leetcode_id ON problems (leetcode_id)",
    ]
    with engine.begin() as connection:
        inspector = inspect(connection)
        backup_exists = inspector.has_table("problems_backup")
        if backup_exists and recreate_backup:
            connection.execute(text("DROP TABLE problems_backup"))
            backup_exists = False
        if not backup_exists:
            connection.execute(text("CREATE TABLE problems_backup AS SELECT * FROM problems"))
            print("Backup created: problems_backup")
        else:
            print("Backup already exists: problems_backup")
        for statement in statements:
            connection.execute(text(statement))


def load_problem_rows() -> list[dict[str, Any]]:
    query = text(
        """
        SELECT id, slug, title, description, input_format, output_format, constraints, leetcode_id
        FROM problems
        ORDER BY slug ASC
        """
    )
    with SessionLocal() as session:
        return [dict(row._mapping) for row in session.execute(query).all()]


def load_uz_translation_rows() -> dict[str, dict[str, Any]]:
    with engine.connect() as connection:
        if not inspect(connection).has_table("problem_translations"):
            return {}
    query = text(
        """
        SELECT problem_id, title, description, input_format, output_format, constraints
        FROM problem_translations
        WHERE language_code = 'uz'
        """
    )
    with SessionLocal() as session:
        return {
            str(row.problem_id): dict(row._mapping)
            for row in session.execute(query).all()
        }


def load_catalog_rows() -> dict[str, dict[str, Any]]:
    catalog = {}
    for problem in build_problem_catalog():
        catalog[problem.slug] = {
            "title": problem.title,
            "description": problem.description,
            "input_format": problem.input_format,
            "output_format": problem.output_format,
            "constraints": problem.constraints_text,
        }
    return catalog


def resolve_problem(
    row: dict[str, Any],
    translation_rows: dict[str, dict[str, Any]],
    catalog_rows: dict[str, dict[str, Any]],
) -> PreparedProblem | None:
    slug = str(row["slug"])
    translation = translation_rows.get(str(row["id"]))
    catalog = catalog_rows.get(slug)
    manual = MANUAL_FALLBACKS.get(slug)
    source = translation or catalog or manual
    if source is None:
        title = normalize_text(row.get("title")) or ""
        description = normalize_text(row.get("description")) or ""
        if title and description and not ENGLISH_MARKER_RE.search(f"{title}\n{description}"):
            source = {
                "title": title,
                "description": description,
                "input_format": normalize_text(row.get("input_format")),
                "output_format": normalize_text(row.get("output_format")),
                "constraints": normalize_text(row.get("constraints")),
            }
        else:
            return None

    title = normalize_text((manual or {}).get("title") or source.get("title"))
    description = normalize_text((manual or {}).get("description") or source.get("description"))
    input_format = normalize_text((manual or {}).get("input_format") or source.get("input_format"))
    output_format = normalize_text((manual or {}).get("output_format") or source.get("output_format"))
    constraints = normalize_text((manual or {}).get("constraints") or source.get("constraints"))
    leetcode_id = (manual or {}).get("leetcode_id") or row.get("leetcode_id")

    if not title or not description:
        return None

    return PreparedProblem(
        id=str(row["id"]),
        slug=slug,
        title=title,
        description=description,
        input_format=input_format,
        output_format=output_format,
        constraints=constraints,
        leetcode_id=leetcode_id,
    )


def apply_updates(rows: list[PreparedProblem], batch_size: int, dry_run: bool) -> None:
    if dry_run:
        print(f"Dry-run: {len(rows)} ta yozuv tayyorlandi, DB update qilinmadi.")
        return
    update_sql = text(
        """
        UPDATE problems
        SET
            title = :title,
            description = :description,
            input_format = :input_format,
            output_format = :output_format,
            constraints = :constraints,
            leetcode_id = :leetcode_id,
            title_uz = :title_uz,
            description_uz = :description_uz
        WHERE id = :id
        """
    )
    with SessionLocal() as session:
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            payload = [
                {
                    "id": row.id,
                    "title": row.title,
                    "description": row.description,
                    "input_format": row.input_format,
                    "output_format": row.output_format,
                    "constraints": row.constraints,
                    "leetcode_id": row.leetcode_id,
                    "title_uz": row.title,
                    "description_uz": row.description,
                }
                for row in batch
            ]
            session.execute(update_sql, payload)
            session.commit()
            print(f"Committed batch: {start + 1}-{start + len(batch)}")


def rollback_from_backup(batch_size: int, dry_run: bool) -> int:
    with engine.connect() as connection:
        if not inspect(connection).has_table("problems_backup"):
            print("Rollback failed. problems_backup jadvali topilmadi.")
            return 1

    backup_query = text(
        """
        SELECT id, title, description, input_format, output_format, constraints
        FROM problems_backup
        ORDER BY slug ASC
        """
    )
    restore_sql = text(
        """
        UPDATE problems
        SET
            title = :title,
            description = :description,
            input_format = :input_format,
            output_format = :output_format,
            constraints = :constraints,
            title_uz = NULL,
            description_uz = NULL
        WHERE id = :id
        """
    )

    with SessionLocal() as session:
        rows = [dict(row._mapping) for row in session.execute(backup_query).all()]
        if dry_run:
            print(f"Dry-run rollback: {len(rows)} ta yozuv backupdan tiklanadi.")
            return 0
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            session.execute(restore_sql, batch)
            session.commit()
            print(f"Rollback batch committed: {start + 1}-{start + len(batch)}")

    clear_problem_cache()
    print(f"Rollback completed successfully: {len(rows)} ta problem tiklandi.")
    return 0


def validate_after_update(rows: list[PreparedProblem]) -> list[str]:
    failures: list[str] = []
    for row in rows:
        if ENGLISH_MARKER_RE.search(f"{row.title}\n{row.description}"):
            failures.append(row.slug)
    return failures


def validate_database_state() -> list[str]:
    pattern = (
        r"\m(given|return|input|output|example|constraints|array|string|integer|number|sum|search|"
        r"substring|palindrome|parentheses|regex|roman|median|convert|reverse|sorted|list|match|"
        r"container|water|stock|anagram|merge|window|character)\M"
    )
    query = text(
        """
        SELECT slug
        FROM problems
        WHERE CONCAT_WS(E'\n', title, description, input_format, output_format, constraints) ~* :pattern
        ORDER BY slug ASC
        LIMIT 20
        """
    )
    with SessionLocal() as session:
        return [str(row.slug) for row in session.execute(query, {"pattern": pattern}).all()]


def clear_problem_cache() -> None:
    settings = get_settings()
    cache_dir = settings.cache_dir
    removed = 0
    for cache_file in cache_dir.glob("*.json"):
        cache_file.unlink(missing_ok=True)
        removed += 1
    if redis and settings.redis_url:
        try:
            client = redis.from_url(settings.redis_url, decode_responses=True)
            for key in client.scan_iter(match="problem:*"):
                client.delete(key)
            client.delete("index")
        except Exception:
            pass
    print(f"Problem cache cleared: {removed} file")


def main() -> int:
    parser = argparse.ArgumentParser(description="In-place Uzbek migration for problems table.")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--recreate-backup", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()

    if args.rollback:
        if args.recreate_backup:
            print("Rollback bilan birga --recreate-backup ishlatib bo'lmaydi.")
            return 5
        return rollback_from_backup(batch_size=max(1, args.batch_size), dry_run=args.dry_run)

    create_backup_and_columns(recreate_backup=args.recreate_backup)
    raw_rows = load_problem_rows()
    translation_rows = load_uz_translation_rows()
    catalog_rows = load_catalog_rows()

    prepared: list[PreparedProblem] = []
    unresolved: list[str] = []
    for row in raw_rows:
        resolved = resolve_problem(row, translation_rows, catalog_rows)
        if resolved is None:
            unresolved.append(f"{row['id']}::{row['slug']}")
        else:
            prepared.append(resolved)

    if unresolved:
        print("Migration stopped. Uzbek source topilmagan muammoli yozuvlar:")
        for item in unresolved:
            print(f" - {item}")
        print("Avval shu yozuvlar uchun uz tarjima yoki curated mapping tayyorlang.")
        return 2

    failures = validate_after_update(prepared)
    if failures:
        print("Migration stopped. Ingliz markerlari hali ham topildi:")
        for slug in failures[:20]:
            print(f" - {slug}")
        return 3

    apply_updates(prepared, batch_size=max(1, args.batch_size), dry_run=args.dry_run)
    if not args.dry_run:
        suspicious_rows = validate_database_state()
        if suspicious_rows:
            print("Migration completed, lekin DB validatsiyasida shubhali ingliz markerlari topildi:")
            for slug in suspicious_rows:
                print(f" - {slug}")
            return 4
        clear_problem_cache()
        print(f"Migration completed successfully: {len(prepared)} ta problem yangilandi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
