/**
 * Client-side judging orchestrator.
 *
 * Runs supported languages directly in the user's browser (no server round
 * trip) against the problem's VISIBLE test cases, and returns a payload shaped
 * exactly like the backend judge so the existing result formatting/UI is reused.
 *
 * Phase 2 pilot: JavaScript only. More languages plug in here as their workers
 * land (typescript -> transpile-then-JS, python -> pyodide, ...).
 */

// Languages judged in the browser. Everything else still goes to the backend.
export const CLIENT_SIDE_LANGUAGES = new Set(["javascript"]);

export function isClientSideLanguage(language) {
  return CLIENT_SIDE_LANGUAGES.has(String(language || "").toLowerCase());
}

function summarize(results) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const runtimeMs = results.reduce((sum, r) => sum + (r.runtime_ms || 0), 0);
  const firstFail = results.find((r) => !r.passed);
  const verdict = total === 0
    ? "Accepted"
    : passed === total
      ? "Accepted"
      : firstFail?.error
        ? "Runtime Error"
        : "Wrong Answer";
  return {
    verdict,
    passed_count: passed,
    total_count: total,
    runtime_ms: runtimeMs,
    memory_bytes: null,
    error_text: firstFail?.error || null,
    case_results: results,
  };
}

/**
 * Run the user's solution against the given visible test cases in a worker.
 * @returns backend-shaped payload: {verdict, passed_count, total_count, case_results, ...}
 */
export function runJavascript({ code, functionName, cases, timeLimitMs = 5000 }) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./jsJudge.worker.js", import.meta.url));
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finish({
        verdict: "TIME_LIMIT_EXCEEDED",
        passed_count: 0,
        total_count: (cases || []).length,
        runtime_ms: timeLimitMs,
        memory_bytes: null,
        error_text: "Kod juda uzoq ishladi (vaqt limiti). Cheksiz sikl bo'lishi mumkin.",
        case_results: [],
      });
    }, timeLimitMs);

    worker.onmessage = (event) => {
      const { type, results, error } = event.data || {};
      if (type === "done") {
        finish(summarize(results || []));
      } else if (type === "compile_error") {
        finish({
          verdict: "Runtime Error",
          passed_count: 0,
          total_count: (cases || []).length,
          runtime_ms: 0,
          memory_bytes: null,
          error_text: error || "Kodni bajarishda xatolik.",
          case_results: [],
        });
      }
    };

    worker.onerror = (err) => {
      finish({
        verdict: "Runtime Error",
        passed_count: 0,
        total_count: (cases || []).length,
        runtime_ms: 0,
        memory_bytes: null,
        error_text: String(err?.message || "Worker xatosi"),
        case_results: [],
      });
    };

    worker.postMessage({ code, functionName, cases: cases || [] });
  });
}

export function runClientSide(language, args) {
  const lang = String(language || "").toLowerCase();
  if (lang === "javascript") return runJavascript(args);
  return Promise.reject(new Error(`Client-side execution not supported for: ${language}`));
}
