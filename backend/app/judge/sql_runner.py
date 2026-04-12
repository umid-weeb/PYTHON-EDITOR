from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, SQLAlchemyError


_FORBIDDEN_STATEMENTS = (
    "insert",
    "update",
    "delete",
    "create",
    "drop",
    "alter",
    "truncate",
    "grant",
    "revoke",
    "commit",
    "rollback",
    "attach",
    "detach",
    "vacuum",
)


@dataclass(frozen=True)
class SqlJudgeResult:
    verdict: str
    passed: bool
    runtime_ms: int
    memory_kb: int
    actual_output: str
    error: str | None = None
    message: str | None = None


class SqlJudge:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def run_case(
        self,
        *,
        testcase: dict[str, Any],
        code: str,
        time_limit_seconds: float,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            query = self._normalize_query(code)
        except ValueError as exc:
            elapsed = time.perf_counter() - started
            return self._payload(
                verdict="Compilation Error",
                passed=False,
                runtime_ms=int(elapsed * 1000),
                memory_kb=0,
                actual_output="",
                error=str(exc),
                message="SQL so'rovi noto'g'ri formatda yozilgan.",
            )

        setup_script = str(testcase.get("input") or "").strip()
        expected_output = str(testcase.get("expected_output") or "").strip()

        try:
            with self.engine.connect() as connection:
                transaction = connection.begin()
                try:
                    self._apply_statement_timeout(connection, time_limit_seconds)
                    self._execute_setup_script(connection, setup_script)
                    columns, rows = self._execute_query(connection, query)
                    actual_output = self._format_result(columns, rows)
                    elapsed = time.perf_counter() - started
                    passed = self._normalize_text(actual_output) == self._normalize_text(expected_output)
                    transaction.rollback()
                    if passed:
                        return self._payload(
                            verdict="Accepted",
                            passed=True,
                            runtime_ms=int(elapsed * 1000),
                            memory_kb=0,
                            actual_output=actual_output,
                        )
                    return self._payload(
                        verdict="Wrong Answer",
                        passed=False,
                        runtime_ms=int(elapsed * 1000),
                        memory_kb=0,
                        actual_output=actual_output,
                        error=None,
                        message="SQL natijasi kutilgan javob bilan mos kelmadi.",
                    )
                except Exception:
                    transaction.rollback()
                    raise
        except DBAPIError as exc:
            elapsed = time.perf_counter() - started
            message = self._sql_error_message(exc)
            verdict = self._classify_db_error(message)
            return self._payload(
                verdict=verdict,
                passed=False,
                runtime_ms=int(elapsed * 1000),
                memory_kb=0,
                actual_output="",
                error=message,
                message=self._friendly_message(verdict, message),
            )
        except SQLAlchemyError as exc:
            elapsed = time.perf_counter() - started
            message = str(getattr(exc, "orig", exc)) or str(exc)
            verdict = self._classify_db_error(message)
            return self._payload(
                verdict=verdict,
                passed=False,
                runtime_ms=int(elapsed * 1000),
                memory_kb=0,
                actual_output="",
                error=message,
                message=self._friendly_message(verdict, message),
            )
        except TimeoutError as exc:
            elapsed = time.perf_counter() - started
            return self._payload(
                verdict="Time Limit Exceeded",
                passed=False,
                runtime_ms=int(elapsed * 1000),
                memory_kb=0,
                actual_output="",
                error=str(exc),
                message="SQL so'rovi vaqt limiti oshdi.",
            )
        except Exception as exc:  # pragma: no cover - defensive
            elapsed = time.perf_counter() - started
            message = str(exc).strip() or "SQL bajarishda kutilmagan xatolik yuz berdi."
            return self._payload(
                verdict="Runtime Error",
                passed=False,
                runtime_ms=int(elapsed * 1000),
                memory_kb=0,
                actual_output="",
                error=message,
                message="SQL bajarishda xatolik yuz berdi.",
            )

    def _payload(
        self,
        *,
        verdict: str,
        passed: bool,
        runtime_ms: int,
        memory_kb: int,
        actual_output: str,
        error: str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        return {
            "verdict": verdict,
            "passed": passed,
            "runtime_ms": runtime_ms,
            "memory_kb": memory_kb,
            "actual_output": actual_output,
            "error": error,
            "message": message,
            "execution_mode": "SQL",
        }

    def _normalize_query(self, code: str) -> str:
        text = self._strip_comments(str(code or "").strip())
        if not text:
            raise ValueError("SQL kodi bo'sh bo'lishi mumkin emas.")

        if text.endswith(";"):
            text = text[:-1].rstrip()

        if ";" in text:
            raise ValueError("Faqat bitta SQL so'rovi qabul qilinadi.")

        normalized = text.lower().strip()
        if not normalized.startswith(("select", "with")):
            raise ValueError("Faqat SELECT yoki WITH so'rovlari qabul qilinadi.")

        for forbidden in _FORBIDDEN_STATEMENTS:
            if re.search(rf"\b{forbidden}\b", normalized):
                raise ValueError("SQL so'rov faqat o'qish rejimida bo'lishi kerak.")

        return text

    def _strip_comments(self, text: str) -> str:
        lines: list[str] = []
        in_block = False
        for raw_line in text.splitlines():
            line = raw_line
            stripped = line.strip()
            if not stripped:
                lines.append("")
                continue
            if in_block:
                if "*/" in stripped:
                    in_block = False
                    after = stripped.split("*/", 1)[1].strip()
                    lines.append(after)
                continue
            if stripped.startswith("/*"):
                in_block = "*/" not in stripped
                if "*/" in stripped:
                    after = stripped.split("*/", 1)[1].strip()
                    if after:
                        lines.append(after)
                continue
            if stripped.startswith("--"):
                continue
            lines.append(line)
        return "\n".join(lines).strip()

    def _execute_setup_script(self, connection, script: str) -> None:
        for statement in self._split_sql_script(script):
            connection.exec_driver_sql(statement)

    def _execute_query(self, connection, query: str) -> tuple[list[str], list[Any]]:
        raw_connection = connection.connection
        cursor = raw_connection.cursor()
        try:
            cursor.execute(query)
            description = cursor.description or []
            columns = [column[0] for column in description]
            rows = cursor.fetchall()
            return columns, rows
        finally:
            cursor.close()

    def _split_sql_script(self, script: str) -> list[str]:
        cleaned = str(script or "").strip()
        if not cleaned:
            return []

        statements: list[str] = []
        buffer: list[str] = []
        in_single = False
        in_double = False
        index = 0

        while index < len(cleaned):
            char = cleaned[index]
            next_char = cleaned[index + 1] if index + 1 < len(cleaned) else ""

            if char == "'" and not in_double:
                if in_single and next_char == "'":
                    buffer.append(char)
                    buffer.append(next_char)
                    index += 2
                    continue
                in_single = not in_single
                buffer.append(char)
                index += 1
                continue

            if char == '"' and not in_single:
                in_double = not in_double
                buffer.append(char)
                index += 1
                continue

            if char == ";" and not in_single and not in_double:
                statement = "".join(buffer).strip()
                if statement:
                    statements.append(statement)
                buffer = []
                index += 1
                continue

            buffer.append(char)
            index += 1

        final_statement = "".join(buffer).strip()
        if final_statement:
            statements.append(final_statement)
        return statements

    def _apply_statement_timeout(self, connection, time_limit_seconds: float) -> None:
        dialect = getattr(self.engine.dialect, "name", "")
        if dialect != "postgresql":
            return

        timeout_ms = max(1, int(float(time_limit_seconds) * 1000))
        connection.exec_driver_sql(f"SET LOCAL statement_timeout = {timeout_ms}")
        connection.exec_driver_sql(f"SET LOCAL idle_in_transaction_session_timeout = {timeout_ms + 1000}")

    def _format_result(self, columns: Iterable[str], rows: list[Any]) -> str:
        column_names = [str(column) for column in columns]
        if not rows:
            return "EMPTY"

        lines = [" | ".join(column_names)]
        for row in rows:
            values = [self._format_cell(value) for value in row]
            lines.append(" | ".join(values))
        return "\n".join(lines)

    def _format_cell(self, value: Any) -> str:
        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return format(value, "f").rstrip("0").rstrip(".") if "." in format(value, "f") else format(value, "f")
        return str(value)

    def _normalize_text(self, value: str) -> str:
        return "\n".join(" ".join(line.split()) for line in str(value).strip().splitlines())

    def _sql_error_message(self, exc: DBAPIError | SQLAlchemyError | Exception) -> str:
        message = str(getattr(exc, "orig", exc)) or str(exc)
        return message.strip() or "SQL so'rovida xatolik yuz berdi."

    def _classify_db_error(self, message: str) -> str:
        normalized = message.lower()
        if "statement timeout" in normalized or "canceling statement" in normalized:
            return "Time Limit Exceeded"
        if any(
            token in normalized
            for token in (
                "syntax error",
                "parse error",
                "unterminated",
                "mismatch",
                "expected",
            )
        ):
            return "Compilation Error"
        if any(
            token in normalized
            for token in (
                "does not exist",
                "unknown column",
                "no such table",
                "ambiguous column",
                "missing from-clause entry",
                "relation",
                "column",
            )
        ):
            return "Compilation Error"
        return "Runtime Error"

    def _friendly_message(self, verdict: str, message: str) -> str:
        lowered = message.lower()
        if verdict == "Time Limit Exceeded":
            return "SQL so'rovi vaqt limiti oshdi."
        if verdict == "Compilation Error":
            if "syntax error" in lowered:
                return "SQL sintaksis xatoligi topildi. Vergul, qavs yoki JOIN shartini tekshiring."
            if "ambiguous column" in lowered:
                return "Ustun nomi noaniq. Alias ishlating."
            if any(token in lowered for token in ("relation", "does not exist", "no such table", "column", "table")):
                return "Jadval yoki ustun nomini tekshiring."
            if "group by" in lowered:
                return "GROUP BY tarkibini tekshiring."
            return "SQL so'rovini tekshiring."
        return "SQL bajarishda xatolik yuz berdi."


def preview_sql_output(
    *,
    engine: Engine,
    setup_script: str,
    query: str,
    time_limit_seconds: float = 2.0,
) -> str:
    """Execute a SQL setup script and query, then return the formatted output.

    This is used while seeding SQL problem testcases so we can derive the
    canonical expected output from the same formatting logic as the judge.
    """

    judge = SqlJudge(engine)
    normalized_query = judge._normalize_query(query)

    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            judge._apply_statement_timeout(connection, time_limit_seconds)
            judge._execute_setup_script(connection, str(setup_script or "").strip())
            columns, rows = judge._execute_query(connection, normalized_query)
            transaction.rollback()
            return judge._format_result(columns, rows)
        except Exception:
            transaction.rollback()
            raise


_sql_judge: SqlJudge | None = None


def get_sql_judge(engine: Engine | None = None) -> SqlJudge:
    global _sql_judge
    if _sql_judge is None or engine is not None:
        from app.database import engine as default_engine

        _sql_judge = SqlJudge(engine or default_engine)
    return _sql_judge
