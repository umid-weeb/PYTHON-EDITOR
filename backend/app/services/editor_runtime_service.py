from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import quickjs
except Exception:  # pragma: no cover - optional dependency
    quickjs = None


_JAVA_PACKAGE_RE = re.compile(r"^\s*package\s+([A-Za-z_][\w.]*)\s*;", re.MULTILINE)
_JAVA_PUBLIC_CLASS_RE = re.compile(r"public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)")


@dataclass(frozen=True)
class Toolchain:
    python: str | None
    node: str | None
    gpp: str | None
    javac: str | None
    java: str | None
    go: str | None


class EditorRuntimeService:
    def __init__(self, cache_root: Path | None = None) -> None:
        backend_root = Path(__file__).resolve().parents[2]
        self.cache_root = cache_root or backend_root / ".data" / "editor_runtime_cache"
        self.cache_root.mkdir(parents=True, exist_ok=True)
        self.result_root = self.cache_root / "_results"
        self.result_root.mkdir(parents=True, exist_ok=True)
        self.go_build_cache = self.cache_root / "_go_build_cache"
        self.go_build_cache.mkdir(parents=True, exist_ok=True)
        self.toolchain = Toolchain(
            python=shutil.which("python3") or shutil.which("python"),
            node=shutil.which("node"),
            gpp=shutil.which("g++") or shutil.which("c++"),
            javac=shutil.which("javac"),
            java=shutil.which("java"),
            go=shutil.which("go"),
        )

    def language_label(self, language: str) -> str:
        mapping = {
            "python": "Python",
            "javascript": "JavaScript",
            "cpp": "C++",
            "java": "Java",
            "go": "Go",
        }
        return mapping.get(self._normalize_language(language), language.title() or "Editor")

    def run(
        self,
        *,
        language: str,
        code: str,
        stdin: str,
        time_limit_seconds: float,
    ) -> dict[str, Any] | None:
        normalized = self._normalize_language(language)
        runner = getattr(self, f"_run_{normalized}", None)
        if runner is None:
            return None
        return runner(code=code, stdin=stdin, time_limit_seconds=time_limit_seconds)

    def _normalize_language(self, language: str) -> str:
        normalized = str(language or "").strip().lower()
        return normalized

    def _source_hash(self, language: str, code: str) -> str:
        digest = hashlib.sha256()
        digest.update(self._normalize_language(language).encode("utf-8"))
        digest.update(b"\0")
        digest.update(code.encode("utf-8"))
        return digest.hexdigest()

    def _language_cache_dir(self, language: str, code: str) -> Path:
        return self.cache_root / self._normalize_language(language) / self._source_hash(language, code)

    def _prepare_cache_dir(self, language: str, code: str) -> Path:
        cache_dir = self._language_cache_dir(language, code)
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _run_process(
        self,
        command: list[str],
        *,
        cwd: Path,
        stdin: str,
        timeout_seconds: float,
        env: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                command,
                cwd=str(cwd),
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
                env=env,
            )
            elapsed = time.perf_counter() - started
            return {
                "timed_out": False,
                "elapsed": elapsed,
                "returncode": completed.returncode,
                "stdout": completed.stdout or "",
                "stderr": completed.stderr or "",
            }
        except subprocess.TimeoutExpired as exc:
            elapsed = time.perf_counter() - started
            return {
                "timed_out": True,
                "elapsed": elapsed,
                "returncode": None,
                "stdout": exc.stdout or "",
                "stderr": exc.stderr or "",
            }

    def _quickjs_bootstrap(self, stdin: str) -> str:
        stdin_json = json.dumps(stdin)
        return f"""
globalThis.__pyzone_stdout = [];
globalThis.__pyzone_stderr = [];
globalThis.__pyzone_stdin = {stdin_json};
globalThis.__pyzone_exit_code = 0;

function __pyzone_to_text(value) {{
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {{
        return String(value);
    }}
    try {{
        return JSON.stringify(value);
    }} catch (_) {{
        return String(value);
    }}
}}

globalThis.console = {{
    log: (...args) => __pyzone_stdout.push(args.map(__pyzone_to_text).join(" ")),
    info: (...args) => __pyzone_stdout.push(args.map(__pyzone_to_text).join(" ")),
    warn: (...args) => __pyzone_stderr.push(args.map(__pyzone_to_text).join(" ")),
    error: (...args) => __pyzone_stderr.push(args.map(__pyzone_to_text).join(" ")),
}};

globalThis.require = (name) => {{
    if (name !== "fs") {{
        throw new Error("Module not available: " + name);
    }}
    return {{
        readFileSync: (fd, encoding) => {{
            if (fd === 0 || fd === "0") return __pyzone_stdin;
            throw new Error("Hozircha faqat stdin (fd=0) qo'llab-quvvatlanadi.");
        }},
    }};
}};

globalThis.process = {{
    stdin: {{
        read: () => __pyzone_stdin,
        toString: () => __pyzone_stdin,
    }},
    stdout: {{
        write: (value) => __pyzone_stdout.push(__pyzone_to_text(value)),
    }},
    stderr: {{
        write: (value) => __pyzone_stderr.push(__pyzone_to_text(value)),
    }},
    argv: [],
    env: {{}},
    exit: (code = 0) => {{
        __pyzone_exit_code = code;
        throw new Error("__PYZONE_EXIT__:" + code);
    }},
}};

globalThis.global = globalThis;
"""

    def _quickjs_output(self, ctx: Any, name: str) -> str:
        raw = ctx.eval(f"JSON.stringify({name})")
        if not raw:
            return ""

        try:
            values = json.loads(raw)
        except Exception:
            return str(raw)

        if isinstance(values, list):
            return "\n".join(str(value) for value in values if value is not None).rstrip()
        if values in {None, ""}:
            return ""
        return str(values)

    def _quickjs_exit_code(self, error_text: str) -> int | None:
        match = re.search(r"__PYZONE_EXIT__:(-?\d+)", error_text)
        if not match:
            return None
        try:
            return int(match.group(1))
        except Exception:
            return None

    def _run_javascript_quickjs(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        if quickjs is None:
            return None

        try:
            ctx = quickjs.Context()
            ctx.set_memory_limit(32 * 1024 * 1024)
            ctx.eval(self._quickjs_bootstrap(stdin))
            ctx.set_time_limit(max(1.0, time_limit_seconds))

            started = time.perf_counter()
            try:
                ctx.eval(code)
            except Exception as exc:
                elapsed = time.perf_counter() - started
                error_text = str(exc).strip()
                stdout_text = self._quickjs_output(ctx, "__pyzone_stdout")
                stderr_text = self._quickjs_output(ctx, "__pyzone_stderr")

                exit_code = self._quickjs_exit_code(error_text)
                if exit_code is not None:
                    if exit_code == 0:
                        return self._result_payload(
                            status_description="Accepted",
                            stdout=stdout_text,
                            stderr=stderr_text,
                            elapsed=elapsed,
                            execution_mode="LOCAL",
                        )
                    return self._result_payload(
                        status_description="Runtime Error",
                        stdout=stdout_text,
                        stderr=stderr_text or f"JavaScript process.exit({exit_code}) bilan tugadi.",
                        elapsed=elapsed,
                        message="JavaScript bajarishda xatolik yuz berdi.",
                        execution_mode="LOCAL",
                    )

                lowered = error_text.lower()
                if "syntaxerror" in lowered:
                    return self._result_payload(
                        status_description="Compilation Error",
                        stdout=stdout_text,
                        compile_output=error_text,
                        elapsed=elapsed,
                        message="JavaScript sintaksis xatoligi topildi.",
                        execution_mode="LOCAL",
                    )
                if "interrupted" in lowered or "time limit" in lowered:
                    return self._result_payload(
                        status_description="Time Limit Exceeded",
                        stdout=stdout_text,
                        stderr=stderr_text or error_text,
                        elapsed=elapsed,
                        message="JavaScript bajarilishi vaqt limitidan oshdi.",
                        execution_mode="LOCAL",
                    )
                return self._result_payload(
                    status_description="Runtime Error",
                    stdout=stdout_text,
                    stderr=stderr_text or error_text,
                    elapsed=elapsed,
                    message="JavaScript bajarishda xatolik yuz berdi.",
                    execution_mode="LOCAL",
                )

            elapsed = time.perf_counter() - started
            stdout_text = self._quickjs_output(ctx, "__pyzone_stdout")
            stderr_text = self._quickjs_output(ctx, "__pyzone_stderr")
            return self._result_payload(
                status_description="Accepted",
                stdout=stdout_text,
                stderr=stderr_text,
                elapsed=elapsed,
                execution_mode="LOCAL",
            )
        except Exception:
            return None

    def _result_payload(
        self,
        *,
        status_description: str,
        stdout: str = "",
        stderr: str = "",
        compile_output: str = "",
        elapsed: float = 0.0,
        message: str | None = None,
        execution_mode: str = "LOCAL",
    ) -> dict[str, Any]:
        return {
            "status": {"description": status_description},
            "stdout": stdout.rstrip(),
            "stderr": stderr.rstrip(),
            "compile_output": compile_output.rstrip(),
            "time": f"{max(0.0, elapsed):.6f}",
            "memory": 0,
            "message": message,
            "execution_mode": execution_mode,
        }

    def _compile_or_run_error(self, *, label: str, process: dict[str, Any], stage: str) -> dict[str, Any]:
        if process["timed_out"]:
            return self._result_payload(
                status_description="Time Limit Exceeded",
                stdout=process["stdout"],
                stderr=process["stderr"],
                elapsed=process["elapsed"],
                message=f"{label} {stage} bosqichi vaqt chegarasidan oshib ketdi.",
            )

        stderr = str(process["stderr"] or "").rstrip()
        if stage == "compile":
            return self._result_payload(
                status_description="Compilation Error",
                stderr="",
                compile_output=stderr or f"{label} kompilyatsiya xatoligi.",
                elapsed=process["elapsed"],
                message=f"{label} kompilyatsiyasi muvaffaqiyatsiz tugadi.",
            )

        runtime_error = stderr or f"{label} bajarishda xatolik yuz berdi. Chiqish kodi: {process['returncode']}"
        return self._result_payload(
            status_description="Runtime Error",
            stdout=process["stdout"],
            stderr=runtime_error,
            elapsed=process["elapsed"],
            message=f"{label} bajarishda xatolik yuz berdi.",
        )

    def _run_python(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        python_bin = self.toolchain.python
        if not python_bin:
            return None

        cache_dir = self._prepare_cache_dir("python", code)
        source_path = cache_dir / "main.py"
        source_path.write_text(code, encoding="utf-8")

        process = self._run_process(
            [python_bin, "-I", str(source_path)],
            cwd=cache_dir,
            stdin=stdin,
            timeout_seconds=max(1.0, time_limit_seconds),
        )
        if process["timed_out"]:
            return self._compile_or_run_error(label="Python", process=process, stage="run")

        stderr = str(process["stderr"] or "").rstrip()
        if process["returncode"] != 0:
            lowered = stderr.lower()
            if "syntaxerror" in lowered or "indentationerror" in lowered or "taberror" in lowered:
                return self._result_payload(
                    status_description="Compilation Error",
                    compile_output=stderr,
                    elapsed=process["elapsed"],
                    message="Python sintaksis xatoligi topildi.",
                )
            return self._compile_or_run_error(label="Python", process=process, stage="run")

        return self._result_payload(
            status_description="Accepted",
            stdout=process["stdout"],
            elapsed=process["elapsed"],
        )

    def _run_javascript(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        quickjs_result = self._run_javascript_quickjs(code=code, stdin=stdin, time_limit_seconds=time_limit_seconds)
        # RCE xavfini yopish: Agar QuickJS (xavfsiz muhit) o'rnatilmagan bo'lsa, OS da 
        # to'g'ridan-to'g'ri Node.js, C++, Java va Go orqali kod yurgizishni bekor qilamiz.
        # Buning o'rniga kodlar editor.py orqali avtomatik ravishda Judge0 API ga yo'naltiriladi.
        return quickjs_result

    def warm_default_runtimes(self) -> None:
        starter_codes = {
            "cpp": """#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Salom, C++ tiliga xush kelibsiz" << '\\n';
    return 0;
}
""",
            "java": """public class Main {
    public static void main(String[] args) {
        System.out.println("Salom, Java tiliga xush kelibsiz");
    }
}
""",
            "go": """package main

import "fmt"

func main() {
    fmt.Println("Salom, Go tiliga xush kelibsiz")
}
""",
        }

        for language, code in starter_codes.items():
            try:
                self.run(language=language, code=code, stdin="", time_limit_seconds=10.0)
            except Exception:
                continue


_editor_runtime_service: EditorRuntimeService | None = None


def get_editor_runtime_service() -> EditorRuntimeService:
    global _editor_runtime_service
    if _editor_runtime_service is None:
        _editor_runtime_service = EditorRuntimeService()
    return _editor_runtime_service
