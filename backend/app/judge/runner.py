from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings
from app.judge.comparator import compare_expected_to_actual, stringify_value
from app.judge.parser import parse_arguments
from app.judge.judge0_client import Judge0Client, get_judge0_settings


HARNESS_CODE = """\
import ast
import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import time
import traceback
import tracemalloc

# Constants for security and stability
# Max 1 million loop iterations or 2 seconds total per test case
MAX_TICKS = 1_000_000
MAX_TIME_SECONDS = 2.0

# Ensure UTF-8 output even on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# --- Security & Instrumentation ---
class LoopTimeoutError(Exception):
    pass

class ArenaSecurity:
    def __init__(self, time_limit=MAX_TIME_SECONDS, tick_limit=MAX_TICKS):
        self.start_time = time.perf_counter()
        self.ticks = 0
        self.time_limit = time_limit
        self.tick_limit = tick_limit

    def tick(self):
        self.ticks += 1
        if self.ticks % 1000 == 0:  # Check time every 1000 iterations to reduce overhead
            if (time.perf_counter() - self.start_time) > self.time_limit:
                raise LoopTimeoutError(f"Time Limit Exceeded: {self.time_limit}s")
        
        if self.ticks > self.tick_limit:
            raise LoopTimeoutError("Infinite Loop Detected: Max iterations exceeded")

class LoopInstrumenter(ast.NodeTransformer):
    '''Parses AST and injects __arena_tick__() into every loop.'''
    def visit_While(self, node):
        self.generic_visit(node)
        tick_call = ast.Expr(ast.Call(
            func=ast.Name(id='__arena_tick__', ctx=ast.Load()),
            args=[], keywords=[]
        ))
        node.body.insert(0, tick_call)
        return node

    def visit_For(self, node):
        self.generic_visit(node)
        tick_call = ast.Expr(ast.Call(
            func=ast.Name(id='__arena_tick__', ctx=ast.Load()),
            args=[], keywords=[]
        ))
        node.body.insert(0, tick_call)
        return node

security_monitor = ArenaSecurity()

def format_user_error(exc):
    if isinstance(exc, LoopTimeoutError):
        return str(exc)
        
    tb = traceback.extract_tb(exc.__traceback__)
    clean_tb = []
    for f in tb:
        if "solution.py" in f.filename or "submission.py" in f.filename:
            # Hide the absolute temp path, show only 'solution.py'
            clean_f = traceback.FrameSummary("solution.py", f.lineno, f.name, line=f.line)
            clean_tb.append(clean_f)
            
    # If we have no frames from the user's file, it might be a system/injection error
    # In that case, we show the full traceback to help debug
    if not clean_tb and tb:
        return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)).strip()

    lines = traceback.format_list(clean_tb)
    if lines:
        lines.insert(0, "Traceback (most recent call last):\\n")
    lines.extend(traceback.format_exception_only(type(exc), exc))
    return "".join(lines).strip()

workspace = pathlib.Path(__file__).resolve().parent
payload = json.loads((workspace / "payload.json").read_text(encoding="utf-8"))
submission_path = workspace / "submission.py"

# --- Instrumentation & Execution ---
try:
    source = submission_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename="solution.py")
    
    # Rewrite loops
    transformer = LoopInstrumenter()
    transformed_tree = transformer.visit(tree)
    ast.fix_missing_locations(transformed_tree)
    
    # Compile
    code_obj = compile(transformed_tree, filename="solution.py", mode="exec")
    
    # Create module
    spec = importlib.util.spec_from_file_location("submission", submission_path)
    module = importlib.util.module_from_spec(spec)
    
    # Inject security tick into both module dict AND builtins
    # This ensures it is accessible even in deep nested scopes or classes
    module.__dict__['__arena_tick__'] = security_monitor.tick
    
    # Also inject into the module's __builtins__ if it exists
    if "__builtins__" in module.__dict__:
        if isinstance(module.__dict__["__builtins__"], dict):
            module.__dict__["__builtins__"]["__arena_tick__"] = security_monitor.tick
        else:
            setattr(module.__dict__["__builtins__"], "__arena_tick__", security_monitor.tick)
    
    # Execute the instrumented code in module's dict
    exec(code_obj, module.__dict__)
    
except SyntaxError as exc:
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Compilation Error",
        "error": format_user_error(exc),
        "runtime_ms": 0,
        "memory_kb": 0
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
    raise SystemExit(0)
except LoopTimeoutError as exc:
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Time Limit Exceeded",
        "error": str(exc),
        "runtime_ms": 0,
        "memory_kb": 0
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
    raise SystemExit(0)
except Exception as exc:
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Runtime Error",
        "error": format_user_error(exc),
        "runtime_ms": 0,
        "memory_kb": 0
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
    raise SystemExit(0)

try:
    if hasattr(module, "Solution"):
        target = getattr(module.Solution(), payload["function_name"])
    else:
        target = getattr(module, payload["function_name"])
except AttributeError as exc:
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Runtime Error",
        "error": f"Function topilmadi: {payload['function_name']}",
        "runtime_ms": 0,
        "memory_kb": 0
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
    raise SystemExit(0)

stdout_buffer = io.StringIO()
tracemalloc.start()
started = time.perf_counter()

try:
    with contextlib.redirect_stdout(stdout_buffer):
        result = target(*payload.get("args", []))
    runtime_ms = int((time.perf_counter() - started) * 1000)
    current, peak = tracemalloc.get_traced_memory()
    actual = result if result is not None else stdout_buffer.getvalue().strip()
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Accepted",
        "actual": actual,
        "runtime_ms": runtime_ms,
        "memory_kb": int(peak / 1024)
    }, ensure_ascii=False, default=repr))
    print("<<<JSON_END>>>")
except LoopTimeoutError as exc:
    runtime_ms = int((time.perf_counter() - started) * 1000)
    current, peak = tracemalloc.get_traced_memory()
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Time Limit Exceeded",
        "error": str(exc),
        "runtime_ms": runtime_ms,
        "memory_kb": int(peak / 1024)
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
except MemoryError as exc:
    runtime_ms = int((time.perf_counter() - started) * 1000)
    current, peak = tracemalloc.get_traced_memory()
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Memory Limit Exceeded",
        "error": format_user_error(exc),
        "runtime_ms": runtime_ms,
        "memory_kb": int(peak / 1024)
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
except Exception as exc:
    runtime_ms = int((time.perf_counter() - started) * 1000)
    current, peak = tracemalloc.get_traced_memory()
    print("<<<JSON_START>>>")
    print(json.dumps({
        "verdict": "Runtime Error",
        "error": format_user_error(exc),
        "runtime_ms": runtime_ms,
        "memory_kb": int(peak / 1024)
    }, ensure_ascii=False))
    print("<<<JSON_END>>>")
finally:
    tracemalloc.stop()
"""


class JudgeRunner:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.docker_available = shutil.which("docker") is not None
        self.judge0 = Judge0Client(get_judge0_settings())

    def run_submission(
        self,
        problem: dict[str, Any],
        code: str,
        mode: str,
    ) -> dict[str, Any]:
        visible = list(problem.get("visible_testcases", []))
        hidden = list(problem.get("hidden_testcases", []))
        selected = visible[:4] if mode == "run" else visible + hidden

        if not selected:
            # Try to give a meaningful error: if the catalog sync hasn't
            # finished yet, tell the user to wait a moment.
            try:
                from app.main import catalog_ready  # noqa: PLC0415
                warming_up = not catalog_ready.is_set()
            except Exception:
                warming_up = False

            error_msg = (
                "Server hali ishga tushmoqda, bir daqiqa kuting va qayta urining."
                if warming_up
                else "Bu masala uchun test topilmadi. Iltimos, sahifani yangilab ko'ring."
            )
            return {
                "verdict": "Runtime Error",
                "runtime_ms": 0,
                "memory_kb": 0,
                "passed_count": 0,
                "total_count": 0,
                "error_text": error_msg,
                "case_results": [],
            }


        case_results: list[dict[str, Any]] = []
        verdict = "Accepted"
        passed_count = 0
        runtime_total = 0
        memory_peak = 0
        error_text = None

        for testcase in selected:
            execution = self._execute_case(problem, code, testcase)
            runtime_total += execution.get("runtime_ms", 0) or 0
            memory_peak = max(memory_peak, execution.get("memory_kb", 0) or 0)

            is_hidden = bool(testcase.get("hidden")) and mode == "submit"
            case_result = {
                "name": testcase.get("name", "Case"),
                "verdict": execution["verdict"],
                "passed": execution["passed"],
                "runtime_ms": execution.get("runtime_ms"),
                "memory_kb": execution.get("memory_kb"),
                "input": None if is_hidden else testcase.get("input"),
                "expected_output": None if is_hidden else testcase.get("expected_output"),
                "actual_output": execution.get("actual_output"),
                "hidden": is_hidden,
                "error": execution.get("error"),
            }
            case_results.append(case_result)

            if execution["passed"]:
                passed_count += 1
                continue

            verdict = execution["verdict"]
            error_text = execution.get("error")
            if mode == "submit":
                break

        return {
            "verdict": verdict,
            "runtime_ms": runtime_total,
            "memory_kb": memory_peak,
            "passed_count": passed_count,
            "total_count": len(selected),
            "error_text": error_text,
            "case_results": case_results,
        }

    def _execute_case(
        self,
        problem: dict[str, Any],
        code: str,
        testcase: dict[str, Any],
    ) -> dict[str, Any]:
        # For now, only Python uses the local harness. Other languages are
        # routed through Judge0 when it is configured; otherwise we return a
        # friendly runtime error explaining that the language is disabled.
        language = problem.get("language", "python")
        if language != "python":
            settings = get_judge0_settings()
            if not settings.enabled:
                return {
                    "verdict": "Runtime Error",
                    "passed": False,
                    "runtime_ms": 0,
                    "memory_kb": 0,
                    "actual_output": "",
                    "error": "Bu til hozircha qo'llab-quvvatlanmaydi. Faqat Python ishlaydi.",
                }

            # Judge0 integration scaffold – choose a language_id mapping here.
            language_id_map = {
                "javascript": 63,  # JavaScript (Node.js 16.x)
                "cpp": 54,  # C++ (GCC 9.2)
            }
            language_id = language_id_map.get(language)
            if language_id is None:
                return {
                    "verdict": "Runtime Error",
                    "passed": False,
                    "runtime_ms": 0,
                    "memory_kb": 0,
                    "actual_output": "",
                    "error": "Bu til hozircha qo'llab-quvvatlanmaydi.",
                }

            try:
                token = self.judge0.submit(
                    source_code=code,
                    language_id=language_id,
                    stdin=testcase.get("input", ""),
                )
                payload = self.judge0.get_result(token)
            except TimeoutError as exc:
                return {
                    "verdict": "Time Limit Exceeded",
                    "passed": False,
                    "runtime_ms": int(problem.get("time_limit_seconds", 1.0) * 1000),
                    "memory_kb": 0,
                    "actual_output": "",
                    "error": str(exc),
                }
            except Exception as exc:  # pragma: no cover - defensive
                return {
                    "verdict": "Runtime Error",
                    "passed": False,
                    "runtime_ms": 0,
                    "memory_kb": 0,
                    "actual_output": "",
                    "error": str(exc),
                }

            stdout = (payload.get("stdout") or "").strip()
            stderr = (payload.get("stderr") or "").strip()
            status = (payload.get("status") or {}).get("description", "")
            time_ms = int(float(payload.get("time") or 0) * 1000)
            memory_kb = int(payload.get("memory") or 0)

            if status.lower().startswith("time limit"):
                return {
                    "verdict": "Time Limit Exceeded",
                    "passed": False,
                    "runtime_ms": time_ms,
                    "memory_kb": memory_kb,
                    "actual_output": stdout,
                    "error": stderr or status,
                }

            if status.lower().startswith("memory limit"):
                return {
                    "verdict": "Memory Limit Exceeded",
                    "passed": False,
                    "runtime_ms": time_ms,
                    "memory_kb": memory_kb,
                    "actual_output": stdout,
                    "error": stderr or status,
                }

            if status.lower() not in {"accepted"}:
                return {
                    "verdict": "Runtime Error",
                    "passed": False,
                    "runtime_ms": time_ms,
                    "memory_kb": memory_kb,
                    "actual_output": stdout,
                    "error": stderr or status,
                }

            return {
                "verdict": "Accepted",
                "passed": True,
                "runtime_ms": time_ms,
                "memory_kb": memory_kb,
                "actual_output": stdout,
                "error": None,
            }

        args = parse_arguments(testcase.get("input", ""))

        with tempfile.TemporaryDirectory(prefix="arena-judge-") as temp_dir:
            workspace = Path(temp_dir)
            (workspace / "submission.py").write_text(code, encoding="utf-8")
            (workspace / "harness.py").write_text(HARNESS_CODE, encoding="utf-8")
            (workspace / "payload.json").write_text(
                json.dumps(
                    {
                        "function_name": problem["function_name"],
                        "args": args,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            result = self._invoke_runner(
                workspace=workspace,
                time_limit_seconds=problem.get("time_limit_seconds", 1.0),
                memory_limit_mb=problem.get("memory_limit_mb", 256),
            )

        return self._evaluate_case_result(
            testcase=testcase,
            execution_result=result,
        )

    def _invoke_runner(
        self,
        workspace: Path,
        time_limit_seconds: float,
        memory_limit_mb: int,
    ) -> dict[str, Any]:
        timeout_seconds = max(1.0, float(time_limit_seconds) + 1.0)

        # Better Python resolution: use sys.executable as primary, python3 as secondary.
        # This is more robust on various Linux/Container environments.
        python_bin = sys.executable or "python3"
        command = [python_bin, "-I", "harness.py"]

        if self.settings.judge_use_docker:
            if not self.docker_available:
                return {
                    "verdict": "Runtime Error",
                    "passed": False,
                    "runtime_ms": 0,
                    "memory_kb": 0,
                    "actual_output": "",
                    "error": "Docker is not available on this host.",
                }

            command = [
                "docker",
                "run",
                "--rm",
                "--network",
                "none",
                "--cpus",
                str(self.settings.judge_cpu_limit),
                "--memory",
                f"{int(memory_limit_mb)}m",
                "--pids-limit",
                str(self.settings.judge_pids_limit),
                "--read-only",
                "--security-opt",
                "no-new-privileges",
                "--cap-drop",
                "ALL",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,size=64m",
                "-e",
                "PYTHONDONTWRITEBYTECODE=1",
                "-v",
                f"{workspace.resolve()}:/workspace:ro",
                "-w",
                "/workspace",
                self.settings.judge_docker_image,
                "/usr/bin/timeout",
                f"{int(timeout_seconds)}s",
                "python3",
                "-I",
                "harness.py",
            ]

        try:
            # Explicitly set current directory and ensure encoding
            completed = subprocess.run(
                command,
                cwd=workspace.absolute(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace", # Handle potential encoding issues in user output
                timeout=timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "verdict": "Time Limit Exceeded",
                "passed": False,
                "runtime_ms": int(timeout_seconds * 1000),
                "memory_kb": 0,
                "actual_output": "",
                "error": "Execution timed out.",
            }
        except Exception as startup_error:
            # Catch fork/exec issues (e.g. OOM or permissions)
            return {
                "verdict": "Runtime Error",
                "passed": False,
                "runtime_ms": 0,
                "memory_kb": 0,
                "actual_output": "",
                "error": f"Judge startup failure: {startup_error}",
            }

        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        
        # Extract JSON between markers
        payload_found = False
        start_marker = "<<<JSON_START>>>"
        end_marker = "<<<JSON_END>>>"
        
        if start_marker in stdout and end_marker in stdout:
            try:
                raw_json = stdout.split(start_marker)[1].split(end_marker)[0].strip()
                payload = json.loads(raw_json)
                payload_found = True
            except (IndexError, json.JSONDecodeError):
                pass

        if not payload_found:
            # Fallback to full stdout if no markers (legacy support or catastrophic failure)
            try:
                # Try to find a valid JSON object in the haystack
                # This helps if the harness printed something before the markers
                trimmed = stdout.strip()
                if trimmed.startswith("{") and trimmed.endswith("}"):
                    payload = json.loads(trimmed)
                    if payload:
                        payload_found = True
            except json.JSONDecodeError:
                pass

        if not payload_found:
            verdict = "Runtime Error"
            # Return codes like 137/139 are usually OOM/Segfault on Linux
            if completed.returncode in {137, 139}:
                verdict = "Memory Limit Exceeded"
            elif completed.returncode != 0:
                verdict = "Runtime Error"
            
            error_msg = stderr.strip()
            if not error_msg:
                # If stderr is empty, maybe the error is in stdout (e.g. half-printed JSON or SystemExit)
                error_msg = stdout.strip() or f"Judge exited with code {completed.returncode}"
                
            return {
                "verdict": verdict,
                "passed": False,
                "runtime_ms": 0,
                "memory_kb": 0,
                "actual_output": None,
                "error": error_msg,
            }

        payload["passed"] = payload.get("verdict") == "Accepted"
        
        actual_val = payload.get("actual")
        payload["actual_output"] = None if actual_val is None else stringify_value(actual_val)
        return payload

    def _evaluate_case_result(
        self,
        testcase: dict[str, Any],
        execution_result: dict[str, Any],
    ) -> dict[str, Any]:
        if execution_result["verdict"] != "Accepted":
            execution_result["passed"] = False
            return execution_result

        # "actual" = raw Python value from harness (bool, int, list, …)
        # "actual_output" = already-stringified display value (set by _invoke_runner)
        actual_value = execution_result.get("actual")
        actual_output_str = execution_result.get("actual_output") or stringify_value(actual_value)

        passed = compare_expected_to_actual(testcase.get("expected_output", ""), actual_value)
        if passed:
            execution_result["passed"] = True
            execution_result["actual_output"] = actual_output_str
            return execution_result

        return {
            "verdict": "Wrong Answer",
            "passed": False,
            "runtime_ms": execution_result.get("runtime_ms", 0),
            "memory_kb": execution_result.get("memory_kb", 0),
            "actual_output": actual_output_str,
            "error": None,
        }


