/**
 * Client-side JavaScript judge (runs in the user's browser, no server).
 *
 * Receives the user's solution + the problem's function name + visible test
 * cases, calls the function per case, captures the return value and any
 * console.log output, compares against the expected output, and posts back
 * case results shaped exactly like the backend judge (so ResultPanel renders
 * them unchanged).
 *
 * Input format matches the backend: each non-empty line of a case input is one
 * JSON-encoded argument. Output is compared canonically (JSON deep-equal).
 */

function heapUsed() {
  // Chrome-only, non-standard. 0 elsewhere (then we estimate).
  try {
    return (self.performance && self.performance.memory && self.performance.memory.usedJSHeapSize) || 0;
  } catch {
    return 0;
  }
}

function byteSize(value) {
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return 0;
  }
}

function stringify(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseValue(line) {
  const text = String(line).trim();
  try {
    return JSON.parse(text);
  } catch {
    return text; // fall back to the raw string (e.g. bare words)
  }
}

function parseArgs(input) {
  return String(input ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(parseValue);
}

function canonical(value) {
  // Stable JSON form for comparison. Arrays keep order (indices matter);
  // numbers/strings/bools normalize naturally.
  return JSON.stringify(value);
}

function deepEqual(actual, expected) {
  return canonical(actual) === canonical(expected);
}

self.onmessage = (event) => {
  const { code, functionName, cases } = event.data;
  const fnName = functionName || "solve";

  // Evaluate the user's code and pull out the target function.
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(
      `${code}\n;return (typeof ${fnName} !== 'undefined') ? ${fnName} : undefined;`
    )();
  } catch (err) {
    self.postMessage({ type: "compile_error", error: String((err && err.message) || err) });
    return;
  }
  if (typeof fn !== "function") {
    self.postMessage({
      type: "compile_error",
      error: `'${fnName}' nomli funksiya topilmadi. Funksiya nomini tekshiring.`,
    });
    return;
  }

  const results = [];
  for (let i = 0; i < (cases || []).length; i += 1) {
    const testcase = cases[i];
    const args = parseArgs(testcase.input);

    const logs = [];
    const originalLog = console.log;
    console.log = (...parts) => logs.push(parts.map(stringify).join(" "));

    let actual;
    let error = null;
    const heapBefore = heapUsed();
    const started = performance.now();
    try {
      actual = fn(...args.map((a) => (Array.isArray(a) ? a.slice() : a)));
    } catch (err) {
      error = String((err && err.stack) || err);
    }
    const runtimeMs = performance.now() - started; // keep sub-ms precision
    const heapAfter = heapUsed();
    console.log = originalLog;

    const expected = parseValue(testcase.expected_output);
    const passed = error === null && deepEqual(actual, expected);

    // Memory: take the larger of the real JS-heap delta (Chrome) and a
    // data-size estimate. The estimate has a ~1KB floor so the value is always
    // reported in KB (not a tiny, noisy byte count).
    const estimate = 1024 + byteSize(args) + byteSize(actual) + logs.join("\n").length;
    const memoryBytes = Math.max(heapAfter - heapBefore, estimate);

    results.push({
      name: testcase.name || `Test ${i + 1}`,
      input: testcase.input,
      expected_output: testcase.expected_output,
      actual_output: error === null ? stringify(actual) : null,
      stdout: logs.join("\n"),
      passed,
      error,
      runtime_ms: runtimeMs,
      memory_bytes: Math.round(memoryBytes),
      verdict: error ? "Runtime Error" : passed ? "Accepted" : "Wrong Answer",
    });
  }

  self.postMessage({ type: "done", results });
};
