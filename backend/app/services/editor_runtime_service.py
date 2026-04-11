from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


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
        node_bin = self.toolchain.node
        if not node_bin:
            return None

        cache_dir = self._prepare_cache_dir("javascript", code)
        source_path = cache_dir / "main.js"
        source_path.write_text(code, encoding="utf-8")

        process = self._run_process(
            [node_bin, str(source_path)],
            cwd=cache_dir,
            stdin=stdin,
            timeout_seconds=max(1.0, time_limit_seconds),
        )
        if process["timed_out"]:
            return self._compile_or_run_error(label="JavaScript", process=process, stage="run")

        if process["returncode"] != 0:
            stderr = str(process["stderr"] or "").rstrip()
            lowered = stderr.lower()
            if "syntaxerror" in lowered or "unexpected token" in lowered:
                return self._result_payload(
                    status_description="Compilation Error",
                    compile_output=stderr or "JavaScript sintaksis xatoligi.",
                    elapsed=process["elapsed"],
                    message="JavaScript sintaksis xatoligi topildi.",
                )
            return self._compile_or_run_error(label="JavaScript", process=process, stage="run")

        return self._result_payload(
            status_description="Accepted",
            stdout=process["stdout"],
            elapsed=process["elapsed"],
        )

    def _run_cpp(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        gpp_bin = self.toolchain.gpp
        if not gpp_bin:
            return None

        cache_dir = self._prepare_cache_dir("cpp", code)
        source_path = cache_dir / "main.cpp"
        binary_name = "main.exe" if os.name == "nt" else "main"
        binary_path = cache_dir / binary_name
        source_path.write_text(code, encoding="utf-8")

        if not binary_path.exists():
            compile_process = self._run_process(
                [gpp_bin, "-O2", "-std=c++17", "-pipe", str(source_path), "-o", str(binary_path)],
                cwd=cache_dir,
                stdin="",
                timeout_seconds=max(5.0, time_limit_seconds),
            )
            if compile_process["timed_out"]:
                return self._compile_or_run_error(label="C++", process=compile_process, stage="compile")
            if compile_process["returncode"] != 0:
                return self._compile_or_run_error(label="C++", process=compile_process, stage="compile")

        run_process = self._run_process(
            [str(binary_path)],
            cwd=cache_dir,
            stdin=stdin,
            timeout_seconds=max(1.0, time_limit_seconds),
        )
        if run_process["timed_out"]:
            return self._compile_or_run_error(label="C++", process=run_process, stage="run")
        if run_process["returncode"] != 0:
            return self._compile_or_run_error(label="C++", process=run_process, stage="run")

        return self._result_payload(
            status_description="Accepted",
            stdout=run_process["stdout"],
            elapsed=run_process["elapsed"],
        )

    def _run_java(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        javac_bin = self.toolchain.javac
        java_bin = self.toolchain.java
        if not javac_bin or not java_bin:
            return None

        package_match = _JAVA_PACKAGE_RE.search(code)
        package_name = package_match.group(1).strip() if package_match else ""
        class_match = _JAVA_PUBLIC_CLASS_RE.search(code)
        class_name = class_match.group(1).strip() if class_match else "Main"

        cache_dir = self._language_cache_dir("java", code)
        source_dir = cache_dir / package_name.replace(".", "/") if package_name else cache_dir
        source_dir.mkdir(parents=True, exist_ok=True)
        source_path = source_dir / f"{class_name}.java"
        class_path = source_dir / f"{class_name}.class"
        source_path.write_text(code, encoding="utf-8")

        if not class_path.exists():
            compile_process = self._run_process(
                [javac_bin, "-encoding", "UTF-8", source_path.name],
                cwd=source_dir,
                stdin="",
                timeout_seconds=max(8.0, time_limit_seconds),
            )
            if compile_process["timed_out"]:
                return self._compile_or_run_error(label="Java", process=compile_process, stage="compile")
            if compile_process["returncode"] != 0:
                return self._compile_or_run_error(label="Java", process=compile_process, stage="compile")

        entry_class = f"{package_name}.{class_name}" if package_name else class_name
        run_process = self._run_process(
            [java_bin, "-Dfile.encoding=UTF-8", "-cp", str(cache_dir), entry_class],
            cwd=cache_dir,
            stdin=stdin,
            timeout_seconds=max(1.0, time_limit_seconds),
        )
        if run_process["timed_out"]:
            return self._compile_or_run_error(label="Java", process=run_process, stage="run")
        if run_process["returncode"] != 0:
            return self._compile_or_run_error(label="Java", process=run_process, stage="run")

        return self._result_payload(
            status_description="Accepted",
            stdout=run_process["stdout"],
            elapsed=run_process["elapsed"],
        )

    def _run_go(self, *, code: str, stdin: str, time_limit_seconds: float) -> dict[str, Any] | None:
        go_bin = self.toolchain.go
        if not go_bin:
            return None

        cache_dir = self._prepare_cache_dir("go", code)
        source_path = cache_dir / "main.go"
        binary_name = "main.exe" if os.name == "nt" else "main"
        binary_path = cache_dir / binary_name
        source_path.write_text(code, encoding="utf-8")

        if not binary_path.exists():
            env = os.environ.copy()
            env["GO111MODULE"] = "off"
            env["GOCACHE"] = str(self.go_build_cache)
            compile_process = self._run_process(
                [go_bin, "build", "-o", binary_name, source_path.name],
                cwd=cache_dir,
                stdin="",
                timeout_seconds=max(8.0, time_limit_seconds),
                env=env,
            )
            if compile_process["timed_out"]:
                return self._compile_or_run_error(label="Go", process=compile_process, stage="compile")
            if compile_process["returncode"] != 0:
                return self._compile_or_run_error(label="Go", process=compile_process, stage="compile")

        run_process = self._run_process(
            [str(binary_path)],
            cwd=cache_dir,
            stdin=stdin,
            timeout_seconds=max(1.0, time_limit_seconds),
        )
        if run_process["timed_out"]:
            return self._compile_or_run_error(label="Go", process=run_process, stage="run")
        if run_process["returncode"] != 0:
            return self._compile_or_run_error(label="Go", process=run_process, stage="run")

        return self._result_payload(
            status_description="Accepted",
            stdout=run_process["stdout"],
            elapsed=run_process["elapsed"],
        )


_editor_runtime_service: EditorRuntimeService | None = None


def get_editor_runtime_service() -> EditorRuntimeService:
    global _editor_runtime_service
    if _editor_runtime_service is None:
        _editor_runtime_service = EditorRuntimeService()
    return _editor_runtime_service
