/**
 * Client-side judging orchestrator.
 *
 * Runs supported languages directly in the user's browser (no server round
 * trip), and returns a payload shaped exactly like the backend judge so the
 * existing result formatting/UI is reused.
 *
 * Languages:
 *  - JavaScript: runs directly in a Web Worker.
 *  - TypeScript: transpiled to JS (sucrase) then judged by the JS worker.
 *  - Python: runs in a persistent Pyodide (WASM) worker.
 *  - C++: compiled + run via the Wandbox cloud (free, CORS, per-user rate limit).
 */
import { runCompiled } from "./cloudJudge.js";

// Judged in the browser / client-driven — both Run and Submit. Everything else
// (remaining compiled languages, SQL) still goes to the backend.
export const CLIENT_SIDE_LANGUAGES = new Set(["javascript", "typescript", "python", "cpp", "java", "go"]);
// Languages that Run client-side (currently identical to the full set).
export const CLIENT_RUN_LANGUAGES = new Set(["javascript", "typescript", "python", "cpp", "java", "go"]);

const lower = (l) => String(l || "").toLowerCase();

export function isClientSideLanguage(language) {
  return CLIENT_SIDE_LANGUAGES.has(lower(language));
}
export function isClientRunLanguage(language) {
  return CLIENT_RUN_LANGUAGES.has(lower(language));
}

// --------------------------------------------------------------------------- #
// Payload helpers (backend-shaped)
// --------------------------------------------------------------------------- #
function summarize(results) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const runtimeMs = results.reduce((sum, r) => sum + (r.runtime_ms || 0), 0);
  const memoryBytes = results.reduce((peak, r) => Math.max(peak, r.memory_bytes || 0), 0);
  const firstFail = results.find((r) => !r.passed);
  const verdict = total === 0 || passed === total
    ? "Accepted"
    : firstFail?.error
      ? "Runtime Error"
      : "Wrong Answer";
  return {
    verdict,
    passed_count: passed,
    total_count: total,
    runtime_ms: runtimeMs,
    memory_bytes: memoryBytes || null,
    error_text: firstFail?.error || null,
    case_results: results,
  };
}

function errorPayload(cases, message) {
  return {
    verdict: "Runtime Error",
    passed_count: 0,
    total_count: (cases || []).length,
    runtime_ms: 0,
    memory_bytes: null,
    error_text: message || "Kodni bajarishda xatolik.",
    case_results: [],
  };
}

function timeoutPayload(cases, timeLimitMs) {
  return {
    verdict: "TIME_LIMIT_EXCEEDED",
    passed_count: 0,
    total_count: (cases || []).length,
    runtime_ms: timeLimitMs || 0,
    memory_bytes: null,
    error_text: "Kod juda uzoq ishladi (vaqt limiti). Cheksiz sikl bo'lishi mumkin.",
    case_results: [],
  };
}

// --------------------------------------------------------------------------- #
// JavaScript (fresh worker per run)
// --------------------------------------------------------------------------- #
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
    const timer = setTimeout(() => finish(timeoutPayload(cases, timeLimitMs)), timeLimitMs);

    worker.onmessage = (event) => {
      const { type, results, error } = event.data || {};
      if (type === "done") finish(summarize(results || []));
      else if (type === "compile_error") finish(errorPayload(cases, error));
    };
    worker.onerror = (err) => finish(errorPayload(cases, String(err?.message || "Worker xatosi")));
    worker.postMessage({ code, functionName, cases: cases || [] });
  });
}

// --------------------------------------------------------------------------- #
// TypeScript (transpile -> JS)
// --------------------------------------------------------------------------- #
export async function runTypescript(args) {
  let jsCode;
  try {
    const { transform } = await import("sucrase");
    jsCode = transform(args.code || "", {
      transforms: ["typescript"],
      disableESTransforms: true,
    }).code;
  } catch (err) {
    return errorPayload(args.cases, `TypeScript xatosi: ${String((err && err.message) || err)}`);
  }
  return runJavascript({ ...args, code: jsCode });
}

// --------------------------------------------------------------------------- #
// Python (persistent Pyodide worker, reused across runs)
// --------------------------------------------------------------------------- #
let pyWorker = null;
let pyReady = null;
let pySeq = 0;
const pyPending = new Map();

function ensurePyWorker() {
  if (pyReady) return pyReady;
  const worker = new Worker(new URL("./pyJudge.worker.js", import.meta.url));
  pyWorker = worker;
  pyReady = new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "ready") return resolve(worker);
      if (data.type === "init_error") {
        pyReady = null;
        pyWorker = null;
        return reject(new Error(data.error));
      }
      const pending = pyPending.get(data.id);
      if (!pending) return;
      pyPending.delete(data.id);
      if (data.type === "result") pending.resolve(summarize(data.results || []));
      else if (data.type === "compile_error") pending.resolve(errorPayload(pending.cases, data.error));
      else pending.resolve(errorPayload(pending.cases, data.error || "Python xatosi"));
    };
    worker.onerror = (err) => {
      pyReady = null;
      pyWorker = null;
      reject(err);
    };
  });
  worker.postMessage({ type: "init" });
  return pyReady;
}

export function runPython({ code, functionName, cases, timeLimitMs = 10000 }) {
  return new Promise((resolve) => {
    ensurePyWorker()
      .then((worker) => {
        const id = ++pySeq;
        let settled = false;
        const done = (payload) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pyPending.delete(id);
          resolve(payload);
        };
        // Pyodide can't be interrupted — on a hang, terminate and recreate it.
        const timer = setTimeout(() => {
          try { worker.terminate(); } catch { /* noop */ }
          pyWorker = null;
          pyReady = null;
          pyPending.clear();
          done(timeoutPayload(cases, timeLimitMs));
        }, timeLimitMs);
        pyPending.set(id, { resolve: done, cases });
        worker.postMessage({ type: "run", id, code, functionName, cases: cases || [] });
      })
      .catch(() => resolve(errorPayload(cases, "Python muhitini yuklab bo'lmadi.")));
  });
}

export function runClientSide(language, args) {
  switch (lower(language)) {
    case "javascript":
      return runJavascript(args);
    case "typescript":
      return runTypescript(args);
    case "python":
      return runPython(args);
    case "cpp":
      return runCompiled("cpp", args);
    case "java":
      return runCompiled("java", args);
    case "go":
      return runCompiled("go", args);
    default:
      return Promise.reject(new Error(`Client-side execution not supported for: ${language}`));
  }
}

/**
 * Warm up a client-side runtime in the background so the first Run is instant.
 * For Python this pre-loads Pyodide (the ~10MB WASM download) while the user is
 * still reading/writing code. No-op / cheap for JS & TS. Safe to call often.
 */
export function warmupClientRuntime(language) {
  const lang = lower(language);
  if (lang === "python") {
    ensurePyWorker().catch(() => { /* will retry on actual run */ });
  }
}
