from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import engine
from app.judge.sql_runner import preview_sql_output
from app.models.problem import Problem, TestCase
from app.services.problem_catalog import ProblemSeed, SeedSummary, TestCaseSeed, _problem_description


SQL_ORDER_OFFSET = 120
SQL_VISIBLE_CASE_COUNT = 2
SQL_HIDDEN_CASE_COUNT = 1
SQL_INPUT_FORMAT = "Kirish yo'q. Yechim sifatida bitta SELECT yoki WITH so'rovi yozing."
SQL_OUTPUT_FORMAT = "Natija jadval ko'rinishida chiqishi kerak."
SQL_CONSTRAINTS = [
    "Faqat SELECT yoki WITH so'rovlari qabul qilinadi.",
    "Jadval va ustun nomlari test muhitidagi nomlar bilan mos bo'lishi kerak.",
    "So'rov natijasi tartibi ORDER BY bilan aniq ko'rsatilishi kerak.",
]
DEFAULT_SQL_STARTER = "-- PostgreSQL yechimingizni shu yerga yozing\nSELECT 1;\n"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SqlColumn:
    name: str
    sql_type: str


@dataclass(frozen=True)
class SqlTable:
    name: str
    columns: tuple[SqlColumn, ...]


@dataclass(frozen=True)
class SqlProblemSpec:
    slug: str
    title: str
    section: str
    difficulty: str
    summary: str
    task_lines: tuple[str, ...]
    tables: tuple[SqlTable, ...]
    query: str
    cases: tuple[dict[str, list[tuple[Any, ...]]], ...]


def C(name: str, sql_type: str) -> SqlColumn:
    return SqlColumn(name=name, sql_type=sql_type)


def T(name: str, *columns: SqlColumn) -> SqlTable:
    return SqlTable(name=name, columns=tuple(columns))


def CASE(**rows: list[tuple[Any, ...]]) -> dict[str, list[tuple[Any, ...]]]:
    normalized: dict[str, list[tuple[Any, ...]]] = {}
    for table_name, table_rows in rows.items():
        normalized[table_name] = [tuple(row) for row in table_rows]
    return normalized


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return repr(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def _build_setup_sql(
    tables: tuple[SqlTable, ...],
    rows_by_table: dict[str, list[tuple[Any, ...]]],
    *,
    dialect_name: str | None = None,
) -> str:
    statements: list[str] = []
    dialect = str(dialect_name or "").lower()
    for table in tables:
        if dialect == "postgresql":
            statements.append(f"DROP TABLE IF EXISTS pg_temp.{table.name}")
        elif dialect == "sqlite":
            statements.append(f"DROP TABLE IF EXISTS temp.{table.name}")
        else:
            statements.append(f"DROP TABLE IF EXISTS {table.name}")
    for table in tables:
        columns_sql = ", ".join(f"{column.name} {column.sql_type}" for column in table.columns)
        create_prefix = "CREATE TEMP TABLE" if dialect in {"postgresql", "sqlite"} else "CREATE TABLE"
        on_commit = " ON COMMIT DROP" if dialect == "postgresql" else ""
        statements.append(f"{create_prefix} {table.name} ({columns_sql}){on_commit}")
    for table in tables:
        table_rows = rows_by_table.get(table.name, [])
        if not table_rows:
            continue
        column_names = ", ".join(column.name for column in table.columns)
        values_sql = ", ".join(
            "(" + ", ".join(_sql_literal(value) for value in row) + ")"
            for row in table_rows
        )
        statements.append(f"INSERT INTO {table.name} ({column_names}) VALUES {values_sql}")
    return ";\n".join(statements) + ";"


def _sql_description(spec: SqlProblemSpec) -> str:
    tables_lines: list[str] = []
    for table in spec.tables:
        schema = ", ".join(f"`{column.name}` {column.sql_type}" for column in table.columns)
        tables_lines.append(f"- `{table.name}`: {schema}")

    return _problem_description(
        title=spec.title,
        summary=spec.summary,
        steps=list(spec.task_lines),
        examples=tables_lines,
        notes=[
            "Javob sifatida faqat SELECT yoki WITH so'rovini yozing.",
            "Natijani testlar bilan solishtirish uchun ORDER BY ni aniq belgilang.",
        ],
    )


def _sql_problem_seed(spec: SqlProblemSpec) -> ProblemSeed:
    test_cases: list[TestCaseSeed] = []
    for index, case_rows in enumerate(spec.cases):
        setup_sql = _build_setup_sql(spec.tables, case_rows, dialect_name=getattr(engine.dialect, "name", ""))
        expected_output = preview_sql_output(
            engine=engine,
            setup_script=setup_sql,
            query=spec.query,
            time_limit_seconds=2.0,
        )
        test_cases.append(
            TestCaseSeed(
                input=setup_sql,
                expected_output=expected_output,
                is_hidden=index >= SQL_VISIBLE_CASE_COUNT,
                sort_order=index,
            )
        )

    return ProblemSeed(
        id=str(uuid5(NAMESPACE_URL, f"https://pyzone.uz/sql/{spec.slug}")),
        title=spec.title,
        slug=spec.slug,
        difficulty=spec.difficulty,
        description=_sql_description(spec),
        input_format=SQL_INPUT_FORMAT,
        output_format=SQL_OUTPUT_FORMAT,
        constraints_text="\n".join(SQL_CONSTRAINTS),
        starter_code=DEFAULT_SQL_STARTER,
        function_name="solve",
        tags=["sql", "postgresql", spec.section],
        test_cases=test_cases,
    )


SQL_PROBLEM_SPECS: list[SqlProblemSpec] = []


SQL_PROBLEM_SPECS.extend(
    [
        SqlProblemSpec(
            slug="sql-basic-joins-avanslar",
            title="Avanslar",
            section="basic-joins",
            difficulty="easy",
            summary="Xodimlar va ularning avans summalarini birlashtirib, faqat mos yozuvlarni ko'rsating.",
            task_lines=(
                "Har bir xodim uchun bonus jadvalidagi mos yozuvni toping.",
                "Natijada xodim identifikatori, ismi va bonus summasi chiqsin.",
            ),
            tables=(
                T("employees", C("id", "INTEGER"), C("name", "TEXT")),
                T("bonuses", C("employee_id", "INTEGER"), C("bonus", "INTEGER")),
            ),
            query=(
                "SELECT e.id, e.name, b.bonus\n"
                "FROM employees e\n"
                "JOIN bonuses b ON b.employee_id = e.id\n"
                "ORDER BY e.id"
            ),
            cases=(
                CASE(
                    employees=[(1, "Ali"), (2, "Vali"), (3, "Zarina")],
                    bonuses=[(1, 500), (2, 1200), (3, 800)],
                ),
                CASE(
                    employees=[(1, "Aziz"), (2, "Dilnoza"), (3, "Sardor"), (4, "Madina")],
                    bonuses=[(1, 0), (2, 1500), (4, 250)],
                ),
                CASE(
                    employees=[(1, "Bek"), (2, "Gulnoza"), (3, "Otabek")],
                    bonuses=[(1, 300), (2, 700), (3, 1100)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-havo-harorati-oshishi",
            title="Havo harorati oshishi",
            section="basic-joins",
            difficulty="easy",
            summary="Ketma-ket kunlardagi haroratni solishtirib, avvalgi kunga nisbatan issiqroq bo'lgan kunlarni toping.",
            task_lines=(
                "Har bir kun uchun oldingi kun bilan solishtiring.",
                "Faqat harorati oshgan kunlarning identifikatorlarini qaytaring.",
            ),
            tables=(T("weather", C("day_id", "INTEGER"), C("temperature", "INTEGER")),),
            query=(
                "SELECT w1.day_id\n"
                "FROM weather w1\n"
                "JOIN weather w2 ON w1.day_id = w2.day_id + 1 AND w1.temperature > w2.temperature\n"
                "ORDER BY w1.day_id"
            ),
            cases=(
                CASE(weather=[(1, 20), (2, 21), (3, 19), (4, 25)]),
                CASE(weather=[(1, 15), (2, 18), (3, 18), (4, 17), (5, 21)]),
                CASE(weather=[(1, 30), (2, 29), (3, 31), (4, 33)]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-id-raqam-almashtirish",
            title="ID raqam almashtirish",
            section="basic-joins",
            difficulty="medium",
            summary="O'rindiqlar jadvalidagi qo'shni ID larni bir-biri bilan almashtiring.",
            task_lines=(
                "Toq ID keyingi ID bilan juftlashsin, juft ID esa oldingi ID bilan joyini almashtirsin.",
                "Agar oxirgi ID toq bo'lib juftiga ega bo'lmasa, o'z joyida qolsin.",
            ),
            tables=(T("seat", C("id", "INTEGER"), C("student", "TEXT")),),
            query=(
                "SELECT\n"
                "  CASE\n"
                "    WHEN id % 2 = 1 AND id < (SELECT MAX(id) FROM seat) THEN id + 1\n"
                "    WHEN id % 2 = 0 THEN id - 1\n"
                "    ELSE id\n"
                "  END AS id,\n"
                "  student\n"
                "FROM seat\n"
                "ORDER BY id"
            ),
            cases=(
                CASE(seat=[(1, "A'lo"), (2, "Behzod"), (3, "Dilbar"), (4, "Elyor")]),
                CASE(seat=[(1, "Gul"), (2, "Hasan"), (3, "Iroda")]),
                CASE(seat=[(1, "Jasur"), (2, "Karima"), (3, "Lola"), (4, "Murod"), (5, "Nodir")]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-mahsulot-savdosi-tahlili",
            title="Mahsulot Savdosi Tahlili",
            section="basic-joins",
            difficulty="medium",
            summary="Mahsulotlar va sotuvlarni birlashtirib, har bir mahsulotning tushumini hisoblang.",
            task_lines=(
                "Sotuvlar jadvalidagi miqdor va birlik narxini ko'paytirib tushumni toping.",
                "Natijani mahsulot nomi bo'yicha kamayuvchi tushum tartibida chiqaring.",
            ),
            tables=(
                T("products", C("product_id", "INTEGER"), C("product_name", "TEXT")),
                T("sales", C("product_id", "INTEGER"), C("quantity", "INTEGER"), C("unit_price", "INTEGER")),
            ),
            query=(
                "SELECT p.product_name, SUM(s.quantity * s.unit_price) AS revenue\n"
                "FROM sales s\n"
                "JOIN products p ON p.product_id = s.product_id\n"
                "GROUP BY p.product_name\n"
                "ORDER BY revenue DESC, p.product_name"
            ),
            cases=(
                CASE(
                    products=[(1, "Olma"), (2, "Banan"), (3, "Anor")],
                    sales=[(1, 3, 10), (2, 2, 15), (3, 4, 8), (1, 1, 10)],
                ),
                CASE(
                    products=[(1, "Kitob"), (2, "Daftar"), (3, "Qalam")],
                    sales=[(1, 5, 40), (2, 10, 12), (3, 20, 3)],
                ),
                CASE(
                    products=[(1, "Choy"), (2, "Qahva"), (3, "Shakar"), (4, "Sut")],
                    sales=[(1, 6, 20), (2, 4, 35), (3, 10, 5), (4, 2, 18), (2, 1, 35)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-mashinaning-ortacha-ishlash-vaqti",
            title="Mashinaning ortacha ishlash vaqti",
            section="basic-joins",
            difficulty="medium",
            summary="Har bir mashina uchun ishga tushish va yakunlash vaqtlaridan o'rtacha ishlash vaqtini toping.",
            task_lines=(
                "Har bir mashina uchun `end_time - start_time` ni hisoblang.",
                "So'ng ularning o'rtachasini chiqaring.",
            ),
            tables=(T("machine_logs", C("machine_id", "INTEGER"), C("start_time", "INTEGER"), C("end_time", "INTEGER")),),
            query=(
                "SELECT machine_id, ROUND(AVG(end_time - start_time), 2) AS avg_runtime\n"
                "FROM machine_logs\n"
                "GROUP BY machine_id\n"
                "ORDER BY machine_id"
            ),
            cases=(
                CASE(machine_logs=[(1, 10, 18), (1, 20, 27), (2, 3, 13), (2, 15, 25)]),
                CASE(machine_logs=[(1, 5, 14), (1, 30, 34), (2, 7, 16), (3, 1, 6)]),
                CASE(machine_logs=[(1, 2, 8), (2, 10, 14), (2, 20, 29), (3, 5, 15)]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-oylik-tranzaksiyalar",
            title="Oylik tranzaksiyalar",
            section="basic-joins",
            difficulty="easy",
            summary="Tranzaksiyalarni oylar bo'yicha yig'ib, har oygi son va umumiy summani ko'rsating.",
            task_lines=(
                "Sana ustunidan yil-oy qismini oling.",
                "Har bir oy uchun tranzaksiya soni va umumiy summani chiqaring.",
            ),
            tables=(T("transactions", C("transaction_date", "TEXT"), C("amount", "INTEGER")),),
            query=(
                "SELECT substr(transaction_date, 1, 7) AS month, COUNT(*) AS tx_count, SUM(amount) AS total_amount\n"
                "FROM transactions\n"
                "GROUP BY substr(transaction_date, 1, 7)\n"
                "ORDER BY month"
            ),
            cases=(
                CASE(transactions=[("2024-01-02", 120), ("2024-01-15", 80), ("2024-02-01", 200), ("2024-02-20", 50)]),
                CASE(transactions=[("2024-03-05", 40), ("2024-03-25", 60), ("2024-04-10", 100)]),
                CASE(transactions=[("2024-01-01", 10), ("2024-01-28", 20), ("2024-02-03", 30), ("2024-02-19", 40), ("2024-03-01", 50)]),
            ),
        ),
    ]
)

SQL_PROBLEM_SPECS.extend(
    [
        SqlProblemSpec(
            slug="sql-aggregation-sorovlarning-sifati-va-ulushi",
            title="So'rovlarning sifati va ulushi",
            section="aggregation",
            difficulty="medium",
            summary="Har bir so'rov turi bo'yicha muvaffaqiyatli javoblar ulushini hisoblang.",
            task_lines=(
                "So'rovlar jurnalini query_name bo'yicha guruhlang.",
                "Har bir so'rov turi uchun umumiy son va success ulushini chiqaring.",
            ),
            tables=(T("request_logs", C("query_name", "TEXT"), C("status", "TEXT")),),
            query=(
                "SELECT query_name, COUNT(*) AS total_requests, "
                "ROUND(AVG(CASE WHEN status = 'success' THEN 1.0 ELSE 0.0 END), 2) AS success_rate\n"
                "FROM request_logs\n"
                "GROUP BY query_name\n"
                "ORDER BY query_name"
            ),
            cases=(
                CASE(
                    request_logs=[
                        ("search", "success"),
                        ("search", "success"),
                        ("search", "fail"),
                        ("filter", "success"),
                        ("filter", "fail"),
                    ],
                ),
                CASE(
                    request_logs=[
                        ("login", "success"),
                        ("login", "fail"),
                        ("login", "success"),
                        ("profile", "success"),
                        ("profile", "success"),
                    ],
                ),
                CASE(
                    request_logs=[
                        ("order", "fail"),
                        ("order", "success"),
                        ("order", "success"),
                        ("search", "fail"),
                        ("search", "fail"),
                    ],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-tanlovda-qatnashganlar",
            title="Tanlovda qatnashganlar",
            section="aggregation",
            difficulty="easy",
            summary="Har bir tanlov uchun qatnashganlar sonini toping.",
            task_lines=(
                "Tanlov nomi bo'yicha guruhlang.",
                "Takrorlangan ism bo'lsa ham faqat noyob qatnashuvchilarni sanang.",
            ),
            tables=(T("contest_entries", C("contest_name", "TEXT"), C("participant_name", "TEXT")),),
            query=(
                "SELECT contest_name, COUNT(DISTINCT participant_name) AS participant_count\n"
                "FROM contest_entries\n"
                "GROUP BY contest_name\n"
                "ORDER BY contest_name"
            ),
            cases=(
                CASE(
                    contest_entries=[
                        ("Spring Cup", "Ali"),
                        ("Spring Cup", "Vali"),
                        ("Spring Cup", "Ali"),
                        ("Summer Cup", "Gul"),
                        ("Summer Cup", "Hasan"),
                    ],
                ),
                CASE(
                    contest_entries=[
                        ("AI Challenge", "Aziz"),
                        ("AI Challenge", "Dilnoza"),
                        ("AI Challenge", "Sardor"),
                        ("Hackathon", "Madina"),
                        ("Hackathon", "Madina"),
                    ],
                ),
                CASE(
                    contest_entries=[
                        ("Math Olympiad", "Lola"),
                        ("Math Olympiad", "Nodir"),
                        ("Math Olympiad", "Olim"),
                        ("Code Sprint", "Pari"),
                    ],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-uzum-tezkor",
            title="Uzum tezkor",
            section="aggregation",
            difficulty="medium",
            summary="Yetkazib berish tezligini kur'erlar bo'yicha solishtiring.",
            task_lines=(
                "Faqat delivered holatidagi yozuvlarni hisobga oling.",
                "Har bir kur'er uchun o'rtacha yetkazish vaqtini chiqaring.",
            ),
            tables=(T("deliveries", C("courier_name", "TEXT"), C("delivery_minutes", "INTEGER"), C("status", "TEXT")),),
            query=(
                "SELECT courier_name, ROUND(AVG(delivery_minutes), 2) AS avg_delivery_minutes\n"
                "FROM deliveries\n"
                "WHERE status = 'delivered'\n"
                "GROUP BY courier_name\n"
                "ORDER BY avg_delivery_minutes, courier_name"
            ),
            cases=(
                CASE(
                    deliveries=[
                        ("Bekzod", 18, "delivered"),
                        ("Bekzod", 20, "delivered"),
                        ("Aziz", 25, "delivered"),
                        ("Aziz", 30, "canceled"),
                        ("Lola", 15, "delivered"),
                    ],
                ),
                CASE(
                    deliveries=[
                        ("Gulbahor", 22, "delivered"),
                        ("Gulbahor", 19, "delivered"),
                        ("Hasan", 28, "delivered"),
                        ("Hasan", 24, "pending"),
                    ],
                ),
                CASE(
                    deliveries=[
                        ("Olim", 12, "delivered"),
                        ("Olim", 14, "delivered"),
                        ("Pari", 16, "delivered"),
                        ("Pari", 18, "delivered"),
                        ("Pari", 20, "canceled"),
                    ],
                ),
            ),
        ),
    ]
)

SQL_PROBLEM_SPECS.extend(
    [
        SqlProblemSpec(
            slug="sql-grouping-5-kishilik-darslar",
            title="5 kishilik darslar",
            section="grouping",
            difficulty="easy",
            summary="Talabalarni 5 kishilik guruhlarga bo'lib, har bir guruhdagi sonni chiqaring.",
            task_lines=(
                "Student_id asosida tartiblangan guruhlarni hosil qiling.",
                "Har bir guruh uchun nechta talaba borligini qaytaring.",
            ),
            tables=(T("students", C("student_id", "INTEGER"), C("student_name", "TEXT")),),
            query=(
                "SELECT CAST((student_id - 1) / 5 AS INTEGER) + 1 AS lesson_group, COUNT(*) AS student_count\n"
                "FROM students\n"
                "GROUP BY CAST((student_id - 1) / 5 AS INTEGER) + 1\n"
                "ORDER BY lesson_group"
            ),
            cases=(
                CASE(students=[(1, "Ali"), (2, "Vali"), (3, "Gul"), (4, "Hasan"), (5, "Lola"), (6, "Olim")]),
                CASE(students=[(1, "Aziz"), (2, "Dilnoza"), (3, "Elyor"), (4, "Farhod"), (5, "Gulbahor"), (6, "Hasan"), (7, "Iroda")]),
                CASE(students=[(1, "Jasur"), (2, "Kamola"), (3, "Lutfiy"), (4, "Madina"), (5, "Nodir"), (6, "Otabek"), (7, "Pari"), (8, "Rustam"), (9, "Sardor"), (10, "Umida"), (11, "Vohid")]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-grouping-eng-katta-boydoq-son",
            title="Eng katta bo'ydoq son",
            section="grouping",
            difficulty="medium",
            summary="Har bir guruhdagi eng katta toq sonni aniqlang.",
            task_lines=(
                "Har bir bucket uchun faqat toq qiymatlarni ko'rib chiqing.",
                "Eng katta toq sonni qaytaring.",
            ),
            tables=(T("number_sets", C("bucket_name", "TEXT"), C("num", "INTEGER")),),
            query=(
                "SELECT bucket_name, MAX(CASE WHEN num % 2 = 1 THEN num END) AS largest_odd_number\n"
                "FROM number_sets\n"
                "GROUP BY bucket_name\n"
                "ORDER BY bucket_name"
            ),
            cases=(
                CASE(number_sets=[("A", 2), ("A", 5), ("A", 11), ("B", 4), ("B", 7), ("B", 9)]),
                CASE(number_sets=[("X", 13), ("X", 8), ("X", 21), ("Y", 6), ("Y", 15), ("Y", 17)]),
                CASE(number_sets=[("M", 3), ("M", 5), ("M", 2), ("N", 10), ("N", 25), ("N", 19)]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-grouping-mahsulot-sotuvi-tahlili",
            title="Mahsulot sotuvi tahlili",
            section="grouping",
            difficulty="medium",
            summary="Mahsulot kategoriyalari bo'yicha umumiy tushum va sotuv sonini hisoblang.",
            task_lines=(
                "Mahsulotlarni category bo'yicha guruhlang.",
                "Har bir kategoriya uchun umumiy miqdor va tushumni chiqaring.",
            ),
            tables=(
                T("products", C("product_id", "INTEGER"), C("category_name", "TEXT"), C("product_name", "TEXT")),
                T("product_sales", C("product_id", "INTEGER"), C("quantity", "INTEGER"), C("unit_price", "INTEGER")),
            ),
            query=(
                "SELECT p.category_name, SUM(s.quantity) AS total_quantity, SUM(s.quantity * s.unit_price) AS total_revenue\n"
                "FROM products p\n"
                "JOIN product_sales s ON s.product_id = p.product_id\n"
                "GROUP BY p.category_name\n"
                "ORDER BY total_revenue DESC, p.category_name"
            ),
            cases=(
                CASE(
                    products=[(1, "Ichimlik", "Choy"), (2, "Ichimlik", "Qahva"), (3, "Yegulik", "Non")],
                    product_sales=[(1, 4, 20), (2, 2, 35), (3, 10, 5), (1, 1, 20)],
                ),
                CASE(
                    products=[(1, "Elektronika", "Sichqoncha"), (2, "Elektronika", "Klaviatura"), (3, "Kitob", "Roman")],
                    product_sales=[(1, 3, 150), (2, 2, 250), (3, 5, 40)],
                ),
                CASE(
                    products=[(1, "Kiyim", "Kofta"), (2, "Kiyim", "Shim"), (3, "Aksessuar", "Soat")],
                    product_sales=[(1, 6, 80), (2, 4, 120), (3, 2, 300), (3, 1, 300)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-grouping-millioner-mijozlar",
            title="Millioner mijozlar",
            section="grouping",
            difficulty="easy",
            summary="Jami xarajati milliondan oshgan mijozlarni toping.",
            task_lines=(
                "Har bir mijoz uchun tranzaksiyalarni yig'ing.",
                "Jami summa 1,000,000 yoki undan katta bo'lgan mijozlarni chiqaring.",
            ),
            tables=(
                T("customers", C("customer_id", "INTEGER"), C("customer_name", "TEXT")),
                T("transactions", C("customer_id", "INTEGER"), C("amount", "INTEGER")),
            ),
            query=(
                "SELECT c.customer_id, c.customer_name, SUM(t.amount) AS total_amount\n"
                "FROM customers c\n"
                "JOIN transactions t ON t.customer_id = c.customer_id\n"
                "GROUP BY c.customer_id, c.customer_name\n"
                "HAVING SUM(t.amount) >= 1000000\n"
                "ORDER BY total_amount DESC, c.customer_id"
            ),
            cases=(
                CASE(
                    customers=[(1, "Ali"), (2, "Vali"), (3, "Gul")],
                    transactions=[(1, 400000), (1, 700000), (2, 300000), (3, 1500000)],
                ),
                CASE(
                    customers=[(1, "Aziz"), (2, "Dilnoza"), (3, "Elyor"), (4, "Madina")],
                    transactions=[(1, 500000), (1, 300000), (2, 900000), (3, 1200000), (4, 250000)],
                ),
                CASE(
                    customers=[(1, "Bek"), (2, "Kamola"), (3, "Lola")],
                    transactions=[(1, 1000000), (2, 200000), (2, 300000), (3, 999999)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-grouping-obunachilar-soni",
            title="Obunachilar soni",
            section="grouping",
            difficulty="easy",
            summary="Har bir kanal uchun obunachilar sonini chiqaring.",
            task_lines=(
                "Kanal nomi bo'yicha guruhlang.",
                "Takrorlangan obunachilar bo'lsa, ularni bitta deb hisoblang.",
            ),
            tables=(T("subscriptions", C("channel_name", "TEXT"), C("subscriber_name", "TEXT")),),
            query=(
                "SELECT channel_name, COUNT(DISTINCT subscriber_name) AS subscriber_count\n"
                "FROM subscriptions\n"
                "GROUP BY channel_name\n"
                "ORDER BY subscriber_count DESC, channel_name"
            ),
            cases=(
                CASE(subscriptions=[("Tech", "Ali"), ("Tech", "Vali"), ("Tech", "Ali"), ("News", "Gul"), ("News", "Hasan")]),
                CASE(subscriptions=[("Music", "Aziz"), ("Music", "Dilnoza"), ("Cinema", "Elyor"), ("Cinema", "Elyor"), ("Cinema", "Farhod")]),
                CASE(subscriptions=[("Sport", "Gulbahor"), ("Sport", "Hasan"), ("Sport", "Iroda"), ("Travel", "Jasur")]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-grouping-songi-bir-oylik-faollik",
            title="So'ngi bir oylik faollik",
            section="grouping",
            difficulty="medium",
            summary="Eng so'nggi oyga tegishli faollik yozuvlarini sanang.",
            task_lines=(
                "Jadvaldagi eng yangi oy qaysi ekanini aniqlang.",
                "Faqat o'sha oy uchun foydalanuvchi faolligini guruhlab chiqaring.",
            ),
            tables=(T("activity_log", C("user_name", "TEXT"), C("activity_date", "TEXT")),),
            query=(
                "SELECT user_name, COUNT(*) AS activity_count\n"
                "FROM activity_log\n"
                "WHERE substr(activity_date, 1, 7) = (SELECT substr(MAX(activity_date), 1, 7) FROM activity_log)\n"
                "GROUP BY user_name\n"
                "ORDER BY user_name"
            ),
            cases=(
                CASE(activity_log=[("Ali", "2024-01-01"), ("Ali", "2024-02-03"), ("Vali", "2024-02-10"), ("Gul", "2024-02-20")]),
                CASE(activity_log=[("Aziz", "2024-03-01"), ("Aziz", "2024-03-15"), ("Dilnoza", "2024-03-05"), ("Elyor", "2024-02-28")]),
                CASE(activity_log=[("Kamola", "2024-04-01"), ("Kamola", "2024-04-03"), ("Lola", "2024-04-02"), ("Lola", "2024-03-30")]),
            ),
        ),
    ]
)

SQL_PROBLEM_SPECS.extend(
    [
        SqlProblemSpec(
            slug="sql-subqueries-2016-yildagi-investitsiya",
            title="2016-yildagi investitsiya",
            section="subqueries",
            difficulty="medium",
            summary="2016-yil investitsiyalaridan o'rtachadan yuqori bo'lganlarini toping.",
            task_lines=(
                "Faqat 2016 yil yozuvlarini ko'rib chiqing.",
                "O'rtacha investitsiyadan yuqori kompaniyalarni chiqaring.",
            ),
            tables=(T("investments", C("company_name", "TEXT"), C("invest_year", "INTEGER"), C("amount", "INTEGER")),),
            query=(
                "SELECT company_name, amount\n"
                "FROM investments\n"
                "WHERE invest_year = 2016\n"
                "  AND amount > (SELECT AVG(amount) FROM investments WHERE invest_year = 2016)\n"
                "ORDER BY amount DESC, company_name"
            ),
            cases=(
                CASE(investments=[("Apex", 2016, 120), ("Apex", 2015, 90), ("Beta", 2016, 200), ("Gamma", 2016, 150)]),
                CASE(investments=[("Delta", 2016, 300), ("Epsilon", 2016, 220), ("Zeta", 2014, 100), ("Eta", 2016, 180)]),
                CASE(investments=[("Kappa", 2016, 500), ("Lambda", 2016, 450), ("Mu", 2016, 350), ("Nu", 2015, 999)]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-subqueries-boshsiz-chavandozlar",
            title="Boshsiz chavandozlar",
            section="subqueries",
            difficulty="easy",
            summary="Maqsadli otga biriktirilmagan chavandozlarni toping.",
            task_lines=(
                "Chavandozlar jadvalidagi horse_id ni tekshiring.",
                "Horses jadvalida mos ot topilmaganlarni qaytaring.",
            ),
            tables=(
                T("riders", C("rider_id", "INTEGER"), C("rider_name", "TEXT"), C("horse_id", "INTEGER")),
                T("horses", C("horse_id", "INTEGER"), C("horse_name", "TEXT")),
            ),
            query=(
                "SELECT r.rider_id, r.rider_name\n"
                "FROM riders r\n"
                "WHERE NOT EXISTS (\n"
                "    SELECT 1\n"
                "    FROM horses h\n"
                "    WHERE h.horse_id = r.horse_id\n"
                ")\n"
                "ORDER BY r.rider_id"
            ),
            cases=(
                CASE(riders=[(1, "Ali", 10), (2, "Vali", 11), (3, "Gul", None)], horses=[(10, "Bars"), (12, "Keldi")]),
                CASE(riders=[(1, "Aziz", 20), (2, "Dilnoza", 21), (3, "Elyor", 22)], horses=[(20, "Tulpor"), (22, "Samandar")]),
                CASE(riders=[(1, "Kamol", 30), (2, "Lola", 31), (3, "Nodir", 32), (4, "Pari", 99)], horses=[(30, "Qahramon"), (32, "Olmos")]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-subqueries-dost-bolamizmi",
            title="Do'st bo'lamizmi",
            section="subqueries",
            difficulty="medium",
            summary="O'zaro do'stligi tasdiqlangan foydalanuvchilarni toping.",
            task_lines=(
                "Do'stlik yozuvlarida ikki tomonlama bog'lanishni tekshiring.",
                "Kamida bitta o'zaro do'stligi bor foydalanuvchilarni chiqaring.",
            ),
            tables=(
                T("users", C("user_id", "INTEGER"), C("user_name", "TEXT")),
                T("friendships", C("user_id", "INTEGER"), C("friend_id", "INTEGER")),
            ),
            query=(
                "SELECT u.user_id, u.user_name\n"
                "FROM users u\n"
                "WHERE EXISTS (\n"
                "    SELECT 1\n"
                "    FROM friendships f\n"
                "    WHERE f.user_id = u.user_id\n"
                "      AND EXISTS (\n"
                "          SELECT 1\n"
                "          FROM friendships r\n"
                "          WHERE r.user_id = f.friend_id AND r.friend_id = u.user_id\n"
                "      )\n"
                ")\n"
                "ORDER BY u.user_id"
            ),
            cases=(
                CASE(
                    users=[(1, "Ali"), (2, "Vali"), (3, "Gul"), (4, "Hasan")],
                    friendships=[(1, 2), (2, 1), (1, 3), (3, 4)],
                ),
                CASE(
                    users=[(1, "Aziz"), (2, "Dilnoza"), (3, "Elyor"), (4, "Farhod")],
                    friendships=[(1, 2), (2, 1), (2, 3), (3, 2), (4, 1)],
                ),
                CASE(
                    users=[(1, "Kamola"), (2, "Lola"), (3, "Nodir"), (4, "Otabek")],
                    friendships=[(1, 2), (2, 1), (3, 4), (4, 3), (1, 3)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-subqueries-restoran-rivojlanishi",
            title="Restoran rivojlanishi",
            section="subqueries",
            difficulty="hard",
            summary="O'rtacha aylanishdan yuqori tushum qilgan restoranlarni toping.",
            task_lines=(
                "Har bir restoran uchun jami tushumni hisoblang.",
                "Jami tushumi barcha restoranlar o'rtachasidan katta bo'lganlarni qaytaring.",
            ),
            tables=(
                T("restaurants", C("restaurant_id", "INTEGER"), C("restaurant_name", "TEXT")),
                T("orders", C("restaurant_id", "INTEGER"), C("amount", "INTEGER")),
            ),
            query=(
                "SELECT r.restaurant_id, r.restaurant_name, SUM(o.amount) AS total_revenue\n"
                "FROM restaurants r\n"
                "JOIN orders o ON o.restaurant_id = r.restaurant_id\n"
                "GROUP BY r.restaurant_id, r.restaurant_name\n"
                "HAVING SUM(o.amount) > (\n"
                "    SELECT AVG(total_revenue)\n"
                "    FROM (\n"
                "        SELECT restaurant_id, SUM(amount) AS total_revenue\n"
                "        FROM orders\n"
                "        GROUP BY restaurant_id\n"
                "    ) ranked\n"
                ")\n"
                "ORDER BY total_revenue DESC, r.restaurant_id"
            ),
            cases=(
                CASE(
                    restaurants=[(1, "Oqtepa"), (2, "Besh Qozon"), (3, "Salom")],
                    orders=[(1, 200), (1, 300), (2, 100), (2, 150), (3, 600)],
                ),
                CASE(
                    restaurants=[(1, "Do'ppi"), (2, "Lazzat"), (3, "Ajoyib"), (4, "Nafis")],
                    orders=[(1, 120), (1, 130), (2, 400), (3, 220), (3, 180), (4, 600)],
                ),
                CASE(
                    restaurants=[(1, "Maydon"), (2, "Xon"), (3, "Shirin")],
                    orders=[(1, 500), (2, 300), (2, 200), (3, 100), (3, 150)],
                ),
            ),
        ),
    ]
)


def build_sql_problem_catalog() -> list[ProblemSeed]:
    return [_sql_problem_seed(spec) for spec in SQL_PROBLEM_SPECS]


def _existing_sql_catalog_is_complete(db: Session) -> bool:
    expected_problem_count = len(SQL_PROBLEM_SPECS)
    expected_case_count = expected_problem_count * (SQL_VISIBLE_CASE_COUNT + SQL_HIDDEN_CASE_COUNT)
    existing_problem_count = (
        db.query(func.count(Problem.id))
        .filter(Problem.slug.like("sql-%"))
        .scalar()
        or 0
    )
    if int(existing_problem_count) < expected_problem_count:
        return False

    existing_case_count = (
        db.query(func.count(TestCase.id))
        .join(Problem, TestCase.problem_id == Problem.id)
        .filter(Problem.slug.like("sql-%"))
        .scalar()
        or 0
    )
    return int(existing_case_count) >= expected_case_count


def seed_sql_problem_catalog(db: Session, *, force: bool = False) -> SeedSummary:
    if not force and _existing_sql_catalog_is_complete(db):
        return SeedSummary(
            total_count=len(SQL_PROBLEM_SPECS),
            inserted_count=0,
            skipped_count=len(SQL_PROBLEM_SPECS),
            forced=False,
        )

    catalog = build_sql_problem_catalog()

    if force:
        sql_problem_ids = [
            problem_id
            for (problem_id,) in db.query(Problem.id).filter(Problem.slug.like("sql-%")).all()
        ]
        if sql_problem_ids:
            db.query(TestCase).filter(TestCase.problem_id.in_(sql_problem_ids)).delete(synchronize_session=False)
            db.query(Problem).filter(Problem.id.in_(sql_problem_ids)).delete(synchronize_session=False)
            db.commit()

    existing_problems = {
        problem.slug: problem
        for problem in db.query(Problem).filter(Problem.slug.like("sql-%")).all()
    }

    inserted_count = 0
    skipped_count = 0

    for problem_seed in catalog:
        existing_problem = existing_problems.get(problem_seed.slug)
        if existing_problem is not None:
            existing_problem.title = problem_seed.title
            existing_problem.difficulty = problem_seed.difficulty
            existing_problem.description = problem_seed.description
            existing_problem.input_format = problem_seed.input_format
            existing_problem.output_format = problem_seed.output_format
            existing_problem.constraints_text = problem_seed.constraints_text
            existing_problem.starter_code = problem_seed.starter_code
            existing_problem.function_name = problem_seed.function_name
            existing_problem.tags_json = json.dumps(problem_seed.tags, ensure_ascii=False)

            existing_cases = (
                db.query(TestCase.expected_output)
                .filter(TestCase.problem_id == existing_problem.id)
                .order_by(TestCase.sort_order)
                .all()
            )
            seed_outputs = [test_case.expected_output for test_case in problem_seed.test_cases]
            existing_outputs = [row[0] for row in existing_cases]

            if existing_outputs != seed_outputs:
                db.query(TestCase).filter(TestCase.problem_id == existing_problem.id).delete()
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
        except Exception as exc:
            from sqlalchemy.exc import IntegrityError

            if isinstance(exc, IntegrityError):
                logger.info("Skipping duplicate SQL problem %s: already exists", problem_seed.slug)
            else:
                logger.warning("Failed to insert SQL problem %s: %s", problem_seed.slug, exc)
            skipped_count += 1

    db.commit()
    return SeedSummary(
        total_count=len(catalog),
        inserted_count=inserted_count,
        skipped_count=skipped_count,
        forced=force,
    )


def ensure_sql_problem_catalog_seeded(db: Session) -> SeedSummary:
    logger.info("Seeding SQL problems...")
    summary = seed_sql_problem_catalog(db, force=False)
    logger.info("SQL problems ready: %s", summary.total_count)
    return summary


@lru_cache(maxsize=1)
def build_sql_problem_order_map() -> dict[str, int]:
    return {
        spec.slug: SQL_ORDER_OFFSET + index
        for index, spec in enumerate(SQL_PROBLEM_SPECS, start=1)
    }

SQL_PROBLEM_SPECS.extend(
    [
        SqlProblemSpec(
            slug="sql-basic-joins-puli-yoq-mijoz",
            title="Puli yo'q mijoz",
            section="basic-joins",
            difficulty="easy",
            summary="To'lov qilmagan yoki jami to'lovi nol bo'lgan mijozlarni aniqlang.",
            task_lines=(
                "Mijozlar ro'yxatida faqat to'lovlar yig'indisi nol bo'lganlarni qoldiring.",
                "Natijada mijoz identifikatori va ismi chiqsin.",
            ),
            tables=(
                T("customers", C("id", "INTEGER"), C("name", "TEXT")),
                T("payments", C("customer_id", "INTEGER"), C("amount", "INTEGER")),
            ),
            query=(
                "SELECT c.id, c.name\n"
                "FROM customers c\n"
                "LEFT JOIN payments p ON p.customer_id = c.id\n"
                "GROUP BY c.id, c.name\n"
                "HAVING COALESCE(SUM(p.amount), 0) = 0\n"
                "ORDER BY c.id"
            ),
            cases=(
                CASE(
                    customers=[(1, "Aziza"), (2, "Bekzod"), (3, "Dilshod")],
                    payments=[(1, 100), (1, -100), (2, 300)],
                ),
                CASE(
                    customers=[(1, "Gulbahor"), (2, "Hasan"), (3, "Iroda"), (4, "Javlon")],
                    payments=[(1, 0), (2, 50), (2, -50), (4, 10)],
                ),
                CASE(
                    customers=[(1, "Kamron"), (2, "Lola"), (3, "Muhammad"), (4, "Nodira")],
                    payments=[(2, 40), (2, 60), (4, -10), (4, 10)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-sessiya-keldi",
            title="Sessiya keldi",
            section="basic-joins",
            difficulty="easy",
            summary="Foydalanuvchilar uchun birinchi sessiya sanasi va sessiyalar sonini toping.",
            task_lines=(
                "Foydalanuvchi va sessiyalar jadvallarini birlashtiring.",
                "Har bir foydalanuvchi uchun birinchi sessiya sanasi va sessiyalar sonini qaytaring.",
            ),
            tables=(
                T("users", C("id", "INTEGER"), C("name", "TEXT")),
                T("sessions", C("user_id", "INTEGER"), C("session_date", "TEXT")),
            ),
            query=(
                "SELECT u.id, u.name, MIN(s.session_date) AS first_session, COUNT(*) AS session_count\n"
                "FROM users u\n"
                "JOIN sessions s ON s.user_id = u.id\n"
                "GROUP BY u.id, u.name\n"
                "ORDER BY u.id"
            ),
            cases=(
                CASE(
                    users=[(1, "Olim"), (2, "Pari"), (3, "Rustam")],
                    sessions=[(1, "2024-03-01"), (1, "2024-03-02"), (2, "2024-03-05"), (3, "2024-03-04"), (3, "2024-03-10")],
                ),
                CASE(
                    users=[(1, "Saida"), (2, "Temur"), (3, "Umida"), (4, "Valijon")],
                    sessions=[(2, "2024-04-01"), (2, "2024-04-03"), (3, "2024-04-02"), (4, "2024-04-01")],
                ),
                CASE(
                    users=[(1, "Xurshid"), (2, "Yulduz"), (3, "Zuhra")],
                    sessions=[(1, "2024-05-11"), (1, "2024-05-12"), (1, "2024-05-13"), (3, "2024-05-09")],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-basic-joins-tasdiqlash-darajasi",
            title="Tasdiqlash darajasi",
            section="basic-joins",
            difficulty="medium",
            summary="Ro'yxatdan o'tgan foydalanuvchilar uchun tasdiqlash darajasini hisoblang.",
            task_lines=(
                "Har bir foydalanuvchining tasdiqlash javoblarini ko'rib chiqing.",
                "Tasdiqlangan javoblar ulushini 2 xonali aniqlikda chiqaring.",
            ),
            tables=(
                T("signups", C("user_id", "INTEGER"), C("signup_date", "TEXT")),
                T("confirmations", C("user_id", "INTEGER"), C("status", "TEXT")),
            ),
            query=(
                "SELECT s.user_id, ROUND(AVG(CASE WHEN c.status = 'confirmed' THEN 1.0 ELSE 0.0 END), 2) AS confirmation_rate\n"
                "FROM signups s\n"
                "LEFT JOIN confirmations c ON c.user_id = s.user_id\n"
                "GROUP BY s.user_id\n"
                "ORDER BY s.user_id"
            ),
            cases=(
                CASE(
                    signups=[(1, "2024-01-01"), (2, "2024-01-02"), (3, "2024-01-03")],
                    confirmations=[(1, "confirmed"), (1, "timeout"), (2, "confirmed"), (3, "confirmed"), (3, "confirmed")],
                ),
                CASE(
                    signups=[(1, "2024-02-01"), (2, "2024-02-02"), (3, "2024-02-03"), (4, "2024-02-04")],
                    confirmations=[(1, "confirmed"), (2, "timeout"), (2, "confirmed"), (4, "timeout")],
                ),
                CASE(
                    signups=[(1, "2024-03-01"), (2, "2024-03-02")],
                    confirmations=[(1, "confirmed"), (1, "confirmed"), (2, "timeout"), (2, "timeout")],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-forsaj-koramiz",
            title="Forsaj ko'ramiz",
            section="aggregation",
            difficulty="medium",
            summary="Poyga natijalaridan avtomobil modeli bo'yicha o'rtacha aylanish vaqtini hisoblang.",
            task_lines=(
                "Har bir avtomobil modeli uchun rekordlarning o'rtacha lap_time qiymatini toping.",
                "Natijani eng kichik o'rtacha vaqt bo'yicha tartiblang.",
            ),
            tables=(T("race_results", C("car_model", "TEXT"), C("driver_name", "TEXT"), C("lap_time", "INTEGER")),),
            query=(
                "SELECT car_model, ROUND(AVG(lap_time), 2) AS avg_lap_time\n"
                "FROM race_results\n"
                "GROUP BY car_model\n"
                "ORDER BY avg_lap_time, car_model"
            ),
            cases=(
                CASE(
                    race_results=[
                        ("Ferrari", "Ali", 82),
                        ("Ferrari", "Ali", 79),
                        ("Lamborghini", "Bek", 90),
                        ("Lamborghini", "Bek", 88),
                        ("Porsche", "Vali", 85),
                    ],
                ),
                CASE(
                    race_results=[
                        ("BMW", "Rustam", 92),
                        ("BMW", "Rustam", 89),
                        ("Audi", "Sardor", 87),
                        ("Audi", "Sardor", 84),
                        ("Tesla", "Jasur", 95),
                    ],
                ),
                CASE(
                    race_results=[
                        ("Nissan", "Lola", 101),
                        ("Nissan", "Lola", 97),
                        ("Subaru", "Diyor", 93),
                        ("Subaru", "Diyor", 91),
                        ("Mazda", "Madin", 88),
                    ],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-loyiha-xodimlari-i",
            title="Loyiha xodimlari I",
            section="aggregation",
            difficulty="medium",
            summary="Har bir loyiha uchun ishtirokchi xodimlarning o'rtacha tajribasini toping.",
            task_lines=(
                "Project_id bo'yicha guruhlang.",
                "Har bir loyiha uchun xodimlar tajribasining o'rtachasini chiqaring.",
            ),
            tables=(
                T("project_members", C("project_id", "INTEGER"), C("employee_name", "TEXT"), C("experience_years", "INTEGER")),
            ),
            query=(
                "SELECT project_id, ROUND(AVG(experience_years), 2) AS avg_experience\n"
                "FROM project_members\n"
                "GROUP BY project_id\n"
                "ORDER BY project_id"
            ),
            cases=(
                CASE(project_members=[(1, "Ali", 3), (1, "Vali", 5), (2, "Gul", 4), (2, "Olim", 2)]),
                CASE(project_members=[(1, "Aziza", 7), (1, "Bekzod", 6), (3, "Dilnoza", 4), (3, "Elyor", 8)]),
                CASE(project_members=[(2, "Farhod", 1), (2, "Gulbahor", 2), (2, "Hasan", 3), (4, "Irina", 10)]),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-ortacha-sotish-bahosi",
            title="O'rtacha sotish bahosi",
            section="aggregation",
            difficulty="hard",
            summary="Mahsulotlarning sotish davriga qarab og'irliklangan o'rtacha narxini hisoblang.",
            task_lines=(
                "Har bir mahsulot uchun narx o'zgarish oralig'ini va sotilgan birliklarni bog'lang.",
                "Natijada mahsulot bo'yicha o'rtacha sotish bahosini chiqaring.",
            ),
            tables=(
                T("prices", C("product_id", "INTEGER"), C("start_date", "TEXT"), C("end_date", "TEXT"), C("price", "INTEGER")),
                T("units_sold", C("product_id", "INTEGER"), C("purchase_date", "TEXT"), C("units", "INTEGER")),
            ),
            query=(
                "SELECT p.product_id, ROUND(SUM(u.units * p.price) / SUM(u.units), 2) AS average_price\n"
                "FROM prices p\n"
                "JOIN units_sold u ON u.product_id = p.product_id AND u.purchase_date BETWEEN p.start_date AND p.end_date\n"
                "GROUP BY p.product_id\n"
                "ORDER BY p.product_id"
            ),
            cases=(
                CASE(
                    prices=[(1, "2024-01-01", "2024-01-31", 10), (1, "2024-02-01", "2024-02-28", 12), (2, "2024-01-01", "2024-12-31", 7)],
                    units_sold=[(1, "2024-01-10", 5), (1, "2024-02-10", 10), (2, "2024-01-20", 8)],
                ),
                CASE(
                    prices=[(1, "2024-03-01", "2024-03-31", 20), (2, "2024-03-01", "2024-03-31", 30)],
                    units_sold=[(1, "2024-03-05", 2), (1, "2024-03-10", 3), (2, "2024-03-12", 1)],
                ),
                CASE(
                    prices=[(1, "2024-04-01", "2024-04-30", 15), (1, "2024-05-01", "2024-05-31", 18), (3, "2024-04-01", "2024-05-31", 25)],
                    units_sold=[(1, "2024-04-05", 4), (1, "2024-05-02", 6), (3, "2024-04-20", 2)],
                ),
            ),
        ),
        SqlProblemSpec(
            slug="sql-aggregation-oyin-tahlili-iv",
            title="O'yin Tahlili IV",
            section="aggregation",
            difficulty="medium",
            summary="O'yinchilar loglaridan ularning birinchi kirish sanasi va umumiy kirishlar sonini toping.",
            task_lines=(
                "Har bir player_id uchun eng kichik event_date ni aniqlang.",
                "Natijada birinchi kirish sanasi va loglar soni chiqsin.",
            ),
            tables=(T("player_logins", C("player_id", "INTEGER"), C("event_date", "TEXT")),),
            query=(
                "SELECT player_id, MIN(event_date) AS first_login, COUNT(*) AS login_count\n"
                "FROM player_logins\n"
                "GROUP BY player_id\n"
                "ORDER BY player_id"
            ),
            cases=(
                CASE(player_logins=[(1, "2024-01-01"), (1, "2024-01-03"), (2, "2024-01-02"), (3, "2024-01-05")]),
                CASE(player_logins=[(1, "2024-02-01"), (2, "2024-02-02"), (2, "2024-02-04"), (3, "2024-02-03"), (3, "2024-02-05")]),
                CASE(player_logins=[(1, "2024-03-10"), (1, "2024-03-11"), (1, "2024-03-12"), (2, "2024-03-15")]),
            ),
        ),
    ]
)
