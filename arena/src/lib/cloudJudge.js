/**
 * Compiled-language judging via Wandbox (wandbox.org) — a free, no-auth public
 * compile+run service (CORS-enabled, so the browser calls it directly; rate
 * limits are per-user by IP, and there is no server infra to run).
 *
 * The browser sends (user code + generated driver) + a stdin payload containing
 * every test case; Wandbox compiles & runs once and returns stdout. We split the
 * driver's marked output into per-case results and compare canonically.
 *
 * Pilot: C++. Other compiled languages plug in via COMPILERS + their own driver.
 */
import { buildStdin, generateCppSource } from "./drivers/cppDriver.js";

const WANDBOX_URL = "https://wandbox.org/api/compile.json";

// language -> Wandbox compiler + flags + driver source generator.
const COMPILERS = {
  cpp: {
    compiler: "gcc-13.2.0",
    // Wandbox splits compiler-option-raw by newlines, not spaces.
    optionRaw: "-std=gnu++17\n-O2",
    genSource: generateCppSource,
  },
};

const canonical = (v) => JSON.stringify(v);
function parseExpected(s) {
  const text = String(s ?? "").trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function b64decode(s) {
  try {
    return decodeURIComponent(escape(atob(s || "")));
  } catch {
    try {
      return atob(s || "");
    } catch {
      return "";
    }
  }
}

function errorPayload(cases, message) {
  return {
    verdict: "Runtime Error",
    passed_count: 0,
    total_count: (cases || []).length,
    runtime_ms: 0,
    memory_bytes: null,
    error_text: message || "Bajarishda xatolik.",
    case_results: [],
  };
}

function summarize(caseResults, runtimeMs) {
  const total = caseResults.length;
  const passed = caseResults.filter((r) => r.passed).length;
  const firstFail = caseResults.find((r) => !r.passed);
  const verdict = total === 0 || passed === total
    ? "Accepted"
    : firstFail?.error
      ? "Runtime Error"
      : "Wrong Answer";
  const memory = caseResults.reduce((m, r) => Math.max(m, r.memory_bytes || 0), 0);
  return {
    verdict,
    passed_count: passed,
    total_count: total,
    runtime_ms: Math.round(runtimeMs || 0),
    memory_bytes: memory || null,
    error_text: firstFail?.error || null,
    case_results: caseResults,
  };
}

function parseDriverOutput(stdout, programError, cases, runtimeMs) {
  // Records: \x1E result \x1F b64(stdout) \x1F b64(err)
  const segments = String(stdout || "")
    .split("\x1E")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  const caseResults = (cases || []).map((testcase, i) => {
    const seg = segments[i];
    if (seg === undefined) {
      return {
        name: testcase.name || `Test ${i + 1}`,
        input: testcase.input,
        expected_output: testcase.expected_output,
        actual_output: null,
        stdout: "",
        passed: false,
        error: String(programError || "").trim() || "Bajarilish to'xtadi.",
        runtime_ms: null,
        memory_bytes: null,
        verdict: "Runtime Error",
      };
    }
    const [resJson = "null", b64out = "", b64err = ""] = seg.split("\x1F");
    const userStdout = b64decode(b64out);
    const err = b64decode(b64err);
    let actualVal;
    let parseOk = true;
    try {
      actualVal = JSON.parse(resJson);
    } catch {
      parseOk = false;
    }
    const expected = parseExpected(testcase.expected_output);
    const passed = !err && parseOk && canonical(actualVal) === canonical(expected);
    return {
      name: testcase.name || `Test ${i + 1}`,
      input: testcase.input,
      expected_output: testcase.expected_output,
      actual_output: err
        ? null
        : parseOk
          ? typeof actualVal === "string"
            ? actualVal
            : JSON.stringify(actualVal)
          : resJson,
      stdout: userStdout,
      passed,
      error: err || null,
      runtime_ms: null,
      memory_bytes: (testcase.input || "").length + resJson.length,
      verdict: err ? "Runtime Error" : passed ? "Accepted" : "Wrong Answer",
    };
  });

  if (caseResults.length === 0) {
    return errorPayload(cases, String(programError || "").trim() || "Natija olinmadi.");
  }
  return summarize(caseResults, runtimeMs);
}

async function runViaWandbox({ compiler, optionRaw, source, stdin, cases, timeLimitMs }) {
  const started = performance.now();
  let data;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), Math.max(30000, (timeLimitMs || 0) + 20000));
  try {
    const res = await fetch(WANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler,
        code: source,
        stdin,
        "compiler-option-raw": optionRaw || "",
      }),
      signal: controller.signal,
    });
    if (res.status === 429) return errorPayload(cases, "Juda ko'p so'rov (rate limit). Bir ozdan keyin qayta urining.");
    if (!res.ok) return errorPayload(cases, `Bajaruvchi xatosi (HTTP ${res.status}).`);
    data = await res.json();
  } catch (err) {
    if (err?.name === "AbortError") return errorPayload(cases, "Bajaruvchi javob bermadi (vaqt tugadi).");
    return errorPayload(cases, `Bajaruvchiga ulanib bo'lmadi: ${String(err?.message || err)}`);
  } finally {
    clearTimeout(abortTimer);
  }
  const wall = performance.now() - started;

  const compileError = (data.compiler_error || "").trim();
  const programOutput = data.program_output || "";
  // Compilation failed: no program output and compiler complained.
  if (!programOutput && compileError) {
    return errorPayload(cases, `Kompilyatsiya xatosi:\n${compileError}`);
  }
  return parseDriverOutput(programOutput, data.program_error, cases, wall);
}

export async function runCompiled(language, { code, signature, cases, timeLimitMs = 20000 }) {
  const cfg = COMPILERS[String(language || "").toLowerCase()];
  if (!cfg) return errorPayload(cases, `Bu til hozircha qo'llab-quvvatlanmaydi: ${language}`);
  if (!signature) return errorPayload(cases, "Imzo ma'lumoti topilmadi.");
  const source = cfg.genSource(signature, code || "");
  const stdin = buildStdin(cases);
  return runViaWandbox({ compiler: cfg.compiler, optionRaw: cfg.optionRaw, source, stdin, cases, timeLimitMs });
}

export const CLOUD_COMPILED_LANGUAGES = new Set(Object.keys(COMPILERS));
