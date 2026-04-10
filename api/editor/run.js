const JUDGE0_BASE_URL = String(process.env.JUDGE0_BASE_URL || "https://ce.judge0.com").replace(/\/+$/, "");
const JUDGE0_API_KEY = String(process.env.JUDGE0_API_KEY || "").trim();
const LANGUAGE_CACHE_TTL_MS = 60 * 60 * 1000;

const LANGUAGE_PATTERNS = {
  python: [
    /^python(?:\s|\(|$)/i,
  ],
  javascript: [
    /^javascript(?:\s|\(|$)/i,
    /\bnode\.js\b/i,
  ],
  cpp: [
    /^c\+\+(?:\s|\(|$)/i,
    /^cpp(?:\s|\(|$)/i,
  ],
  java: [
    /^java(?:\s|\(|$)/i,
  ],
  go: [
    /^go(?:\s|\(|$)/i,
    /^golang(?:\s|\(|$)/i,
  ],
};

let languagesCache = null;
let languagesCacheExpiresAt = 0;
let languagesCachePromise = null;

function headers() {
  const base = {
    "Content-Type": "application/json",
  };
  if (JUDGE0_API_KEY) {
    base["X-Auth-Token"] = JUDGE0_API_KEY;
    base["X-RapidAPI-Key"] = JUDGE0_API_KEY;
  }
  return base;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function safeJsonParse(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readRequestBody(req) {
  if (req.body !== undefined) {
    const parsed = safeJsonParse(req.body);
    if (parsed && typeof parsed === "object") return parsed;
    if (req.body && typeof req.body === "object") return req.body;
    return {};
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const parsed = safeJsonParse(raw);
      resolve(parsed && typeof parsed === "object" ? parsed : {});
    });
    req.on("error", reject);
  });
}

async function listLanguages() {
  if (languagesCache && Date.now() < languagesCacheExpiresAt) {
    return languagesCache;
  }

  if (!languagesCachePromise) {
    languagesCachePromise = fetch(`${JUDGE0_BASE_URL}/languages`, {
      headers: headers(),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Judge0 languages request failed (${response.status})`);
        }

        const payload = await response.json();
        if (Array.isArray(payload)) {
          return payload.filter((item) => item && typeof item === "object");
        }

        if (payload && typeof payload === "object") {
          for (const key of ["languages", "items", "data"]) {
            if (Array.isArray(payload[key])) {
              return payload[key].filter((item) => item && typeof item === "object");
            }
          }
        }

        throw new Error("Unexpected response from Judge0 languages endpoint");
      })
      .finally(() => {
        languagesCachePromise = null;
      });
  }

  languagesCache = await languagesCachePromise;
  languagesCacheExpiresAt = Date.now() + LANGUAGE_CACHE_TTL_MS;
  return languagesCache;
}

async function resolveLanguageId(language) {
  const normalized = String(language || "").toLowerCase();
  const patterns = LANGUAGE_PATTERNS[normalized];
  if (!patterns) {
    return { languageId: null, languageName: null };
  }

  const catalog = await listLanguages();
  const normalizedCatalog = [];
  for (const item of catalog) {
    const languageId = toInt(item.id, 0);
    const name = String(item.name || "").trim();
    if (languageId > 0 && name) {
      normalizedCatalog.push({ languageId, name });
    }
  }

  normalizedCatalog.sort((left, right) => right.languageId - left.languageId);
  for (const entry of normalizedCatalog) {
    if (patterns.some((pattern) => pattern.test(entry.name))) {
      return entry;
    }
  }

  return { languageId: null, languageName: null };
}

function buildResponse({ language, languageName, languageId, token, payload }) {
  const statusPayload = payload?.status || {};
  const statusDescription = String(statusPayload.description || "").trim();
  const stdout = String(payload?.stdout || "");
  const stderr = String(payload?.stderr || "");
  const compileOutput = String(payload?.compile_output || "");
  const message = payload?.message;
  const runtimeMs = toInt(Number(payload?.time || 0) * 1000, 0);
  const memoryKb = toInt(payload?.memory, 0);

  let verdict = statusDescription || "Accepted";
  const lowered = verdict.toLowerCase();
  let error = null;

  if (lowered !== "accepted") {
    if (lowered.includes("compilation")) {
      verdict = "Compilation Error";
      error = compileOutput || stderr || statusDescription || message;
    } else if (lowered.includes("time limit")) {
      verdict = "Time Limit Exceeded";
      error = stderr || statusDescription || message;
    } else if (lowered.includes("memory limit")) {
      verdict = "Memory Limit Exceeded";
      error = stderr || statusDescription || message;
    } else if (lowered.includes("wrong answer")) {
      verdict = "Wrong Answer";
      error = stderr || statusDescription || message;
    } else {
      verdict = statusDescription || "Runtime Error";
      error = stderr || compileOutput || statusDescription || message;
    }
  }

  return {
    language,
    language_name: languageName,
    verdict,
    stdout,
    stderr,
    compile_output: compileOutput,
    runtime_ms: runtimeMs,
    memory_kb: memoryKb,
    status: statusDescription || null,
    message: message == null || message === "" ? null : String(message),
    error: error == null || error === "" ? null : String(error),
    token,
    language_id: languageId,
  };
}

async function submitCode({ sourceCode, languageId, stdin }) {
  const response = await fetch(
    `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Judge0 submit failed (${response.status})`);
  }

  const data = await response.json();
  const token = String(data?.token || "").trim();
  if (!token) {
    throw new Error("Judge0 submission token missing");
  }
  return token;
}

async function getResult(token, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const url = `${JUDGE0_BASE_URL}/submissions/${encodeURIComponent(token)}?base64_encoded=false`;

  while (Date.now() < deadline) {
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Judge0 result failed (${response.status})`);
    }

    const payload = await response.json();
    const statusId = toInt(payload?.status?.id, 0);
    if (statusId !== 1 && statusId !== 2) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  throw new Error("Judge0 execution timed out");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const language = String(body.language || "python").toLowerCase();
    const code = String(body.code || "");
    const stdin = String(body.stdin || "");
    const timeLimitSeconds = Math.min(60, Math.max(1, Number(body.time_limit_seconds || 20)));

    if (!code.trim()) {
      res.status(400).json({ detail: "Kod kiritilmagan." });
      return;
    }

    const { languageId, languageName } = await resolveLanguageId(language);
    if (!languageId) {
      res.status(400).json({ detail: "Tanlangan til Judge0 xizmatida topilmadi." });
      return;
    }

    const token = await submitCode({ sourceCode: code, languageId, stdin });
    const payload = await getResult(token, timeLimitSeconds);
    res.status(200).json(buildResponse({
      language,
      languageName,
      languageId,
      token,
      payload,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kodni ishga tushirishda xatolik yuz berdi.";
    if (String(message).includes("timed out")) {
      res.status(504).json({ detail: "Kodni bajarish vaqt chegarasidan oshib ketdi." });
      return;
    }

    res.status(502).json({ detail: "Kodni ishga tushirishda xatolik yuz berdi.", error: String(message) });
  }
};
