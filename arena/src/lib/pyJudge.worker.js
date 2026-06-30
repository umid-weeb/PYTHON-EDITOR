/**
 * Client-side Python judge — runs the user's solution in the browser via
 * Pyodide (WebAssembly), mirroring the backend harness: exec the code, find the
 * Solution method / function, call it per test case, capture return + stdout,
 * measure runtime + peak memory (tracemalloc), and compare canonically.
 *
 * The worker stays alive across runs (Pyodide is expensive to load). On a hang
 * (e.g. an infinite loop) the orchestrator terminates and recreates the worker.
 *
 * Used for the Arena's "Sinash" (Run) on Python; Submit stays server-side.
 */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodide = null;
let loadingPromise = null;

async function ensurePyodide() {
  if (pyodide) return pyodide;
  if (!loadingPromise) {
    loadingPromise = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/" });
  }
  pyodide = await loadingPromise;
  return pyodide;
}

// Pure-Python judging harness (no Pyodide-specific calls — testable in CPython).
const HARNESS = `
import json, io, contextlib, traceback, ast, time, tracemalloc

def _parse_value(line):
    s = str(line).strip()
    if s == "":
        return ""
    try:
        return json.loads(s)
    except Exception:
        pass
    try:
        return ast.literal_eval(s)
    except Exception:
        return s

def _parse_args(inp):
    return [_parse_value(l) for l in str(inp).splitlines() if str(l).strip() != ""]

def _norm(v):
    if isinstance(v, (list, tuple)):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in sorted(v.items())}
    return v

def _stringify(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    try:
        return json.dumps(_norm(v), ensure_ascii=False)
    except Exception:
        return str(v)

def _err(e):
    return "".join(traceback.format_exception_only(type(e), e)).strip()

def judge(user_code, function_name, cases_json):
    ns = {}
    try:
        exec(user_code, ns)
    except Exception as e:
        return json.dumps({"compile_error": _err(e)})

    fn = None
    if "Solution" in ns:
        try:
            fn = getattr(ns["Solution"](), function_name, None)
        except Exception:
            fn = None
    if fn is None:
        fn = ns.get(function_name)
    if not callable(fn):
        return json.dumps({"compile_error": "'" + str(function_name) + "' nomli funksiya topilmadi."})

    results = []
    for i, c in enumerate(json.loads(cases_json)):
        args = _parse_args(c.get("input", ""))
        buf = io.StringIO()
        err = None
        actual = None
        tracemalloc.start()
        t0 = time.perf_counter()
        try:
            with contextlib.redirect_stdout(buf):
                actual = fn(*args)
        except Exception as e:
            err = _err(e)
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        _cur, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        expected = _parse_value(c.get("expected_output", ""))
        passed = err is None and _norm(actual) == _norm(expected)
        results.append({
            "name": c.get("name") or ("Test " + str(i + 1)),
            "input": c.get("input"),
            "expected_output": c.get("expected_output"),
            "actual_output": None if err is not None else _stringify(actual),
            "stdout": buf.getvalue().rstrip(),
            "passed": passed,
            "error": err,
            "runtime_ms": runtime_ms,
            "memory_bytes": int(peak),
            "verdict": "Runtime Error" if err is not None else ("Accepted" if passed else "Wrong Answer"),
        })
    return json.dumps(results)
`;

self.onmessage = async (event) => {
  const { type, id, code, functionName, cases } = event.data || {};

  if (type === "init") {
    try {
      await ensurePyodide();
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "init_error", error: String((err && err.message) || err) });
    }
    return;
  }

  if (type === "run") {
    try {
      const py = await ensurePyodide();
      py.runPython(HARNESS);
      py.globals.set("__USER_CODE", code || "");
      py.globals.set("__FN_NAME", functionName || "solve");
      py.globals.set("__CASES", JSON.stringify(cases || []));
      const out = py.runPython("judge(__USER_CODE, __FN_NAME, __CASES)");
      const parsed = JSON.parse(out);
      if (parsed && parsed.compile_error) {
        self.postMessage({ type: "compile_error", id, error: parsed.compile_error });
      } else {
        self.postMessage({ type: "result", id, results: parsed });
      }
    } catch (err) {
      self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
    }
  }
};
