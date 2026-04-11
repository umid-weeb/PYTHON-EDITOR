const BACKEND_CHAT_URL = "http://16.16.26.138/api/editor/chat";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1/models";
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
const OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT_TEMPLATE = `Sen Pyzone online editor uchun aqlli kod yordamchisan.

MAQSAD:
- Foydalanuvchi yozayotgan kod, tanlangan matn, til, starter pack, natija paneli va kursor joylashuviga qarab aniq yordam ber.
- Foydalanuvchi nimani maqsad qilganini tushunib, unga eng qisqa va foydali yo'lni ko'rsat.
- Kodning maqsadini bir jumlada ayt: masalan, massivni yig'ish, satrni parse qilish, shartni tekshirish yoki formatlangan output chiqarish.

JAVOB QOIDALARI:
- Faqat o'zbek tilida javob ber.
- Xatoni aniq top: qaysi qator, qaysi qism va nima uchun xato ekanini sodda ayt.
- Agar foydalanuvchi yechim so'rasa, minimal va ishlaydigan snippet berishing mumkin.
- Agar faqat tushuntirish so'rasa, ortiqcha kod yozma.
- Javob qisqa, amaliy va muloyim bo'lsin.
- Agar console input holati faol bo'lsa, kutilyotgan qiymatni yoki promptni tushuntir.
- Agar savol noaniq bo'lsa, bitta aniqlashtiruvchi savol ber.
- Kodni copy-paste qilishga qulay tarzda tartibli yoz.
- Javobni 2-4 qisqa jumlada yoki qisqa punktlarda ber.

EDITOR KONTEKSTI:
{editor_context}

TANLANGAN MATN:
{selected_text}

JORIY KOD:
{code}

NATIJA PANELI:
{output_text}`;

function readRequestBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (req.body && typeof req.body === "object") {
      return req.body;
    }
    return {};
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function trimText(value, limit) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function buildPayload(body) {
  const language = String(body.language || "python").toLowerCase();
  const starterPack = String(body.starter_pack || "array");
  const code = trimText(body.code, 2600) || "(Hali kod yozilmagan)";
  const selectedText = trimText(body.selected_text, 700) || "(Tanlangan matn yo'q)";
  const outputText = trimText(body.output_text, 700) || "(Natija paneli hozircha bo'sh)";
  const consolePrompt = trimText(body.console_input_prompt, 180) || "(faol emas)";
  const userMessage = trimText(body.user_message, 1000);
  const history = Array.isArray(body.conversation_history) ? body.conversation_history.slice(-4) : [];

  const editorContext = [
    `Til: ${language}`,
    `Starter pack: ${starterPack || "default"}`,
    `Kursor: satr ${Math.max(1, toInt(body.cursor_line, 1))}, ustun ${Math.max(1, toInt(body.cursor_column, 1))}`,
    `Satrlar soni: ${Math.max(0, toInt(body.line_count, 0))}`,
    `Tema: ${body.is_dark_mode ? "dark" : "light"}`,
    `Console input holati: ${body.console_input_active ? "aktiv" : "idle"}`,
    `Console input prompt: ${consolePrompt}`,
    `Foydalanuvchi savoli: ${userMessage || "(bo'sh)"}`,
  ].join("\n");

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace("{editor_context}", editorContext)
    .replace("{selected_text}", selectedText)
    .replace("{code}", code)
    .replace("{output_text}", outputText);

  const messages = [{ role: "system", content: systemPrompt }];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    const content = trimText(item.content, 1200);
    if (content) {
      messages.push({ role, content });
    }
  }
  messages.push({ role: "user", content: userMessage || "(bo'sh savol)" });

  const historyLines = [systemPrompt, ""];
  for (const item of messages.slice(1)) {
    const label = item.role === "assistant" ? "AI Yordamchi" : "Foydalanuvchi";
    historyLines.push(`${label}: ${item.content}`);
  }
  historyLines.push("AI Yordamchi:");

  return {
    language,
    starterPack,
    code,
    selectedText,
    outputText,
    consolePrompt,
    userMessage,
    history,
    editorContext,
    systemPrompt,
    messages,
    fullPrompt: historyLines.join("\n"),
  };
}

async function readJsonResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

async function tryBackend(body) {
  try {
    const response = await fetch(BACKEND_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await readJsonResponse(response);
    if (response.ok) {
      return { ok: true, payload };
    }

    const detail = pickString(payload?.detail, payload?.message, payload?.error, `HTTP ${response.status}`);
    return {
      ok: false,
      status: response.status,
      detail,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : "Backend bilan bog'lanib bo'lmadi.",
    };
  }
}

async function callGroq(messages, apiKey) {
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 192,
      temperature: 0.7,
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(pickString(payload?.error?.message, payload?.detail, payload?.message, `Groq HTTP ${response.status}`));
  }

  const reply = pickString(payload?.choices?.[0]?.message?.content);
  if (!reply) {
    throw new Error("Groq javobi bo'sh qaytdi.");
  }
  return reply;
}

async function callOpenAI(messages, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: 192,
      temperature: 0.7,
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(pickString(payload?.error?.message, payload?.detail, payload?.message, `OpenAI HTTP ${response.status}`));
  }

  const reply = pickString(payload?.choices?.[0]?.message?.content);
  if (!reply) {
    throw new Error("OpenAI javobi bo'sh qaytdi.");
  }
  return reply;
}

async function callGemini(fullPrompt, apiKey) {
  for (const model of GEMINI_MODELS) {
    const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 192,
          temperature: 0.7,
        },
      }),
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      continue;
    }

    const reply = pickString(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (reply) {
      return reply;
    }
  }

  throw new Error("Gemini javobi olinmadi.");
}

function json(res, statusCode, payload) {
  res.status(statusCode).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, { detail: "Method not allowed" });
    return;
  }

  const body = await readRequestBody(req);
  const parsed = buildPayload(body);

  if (!parsed.code || parsed.code === "(Hali kod yozilmagan)") {
    json(res, 400, { detail: "Kod kiritilmagan." });
    return;
  }

  if (!parsed.userMessage) {
    json(res, 400, { detail: "Savol kiritilmagan." });
    return;
  }

  const backend = await tryBackend(body);
  if (backend.ok) {
    json(res, 200, backend.payload);
    return;
  }

  const errors = [
    `Editor backend: ${backend.status || "network"} ${backend.detail}`,
  ];

  const groqKey = pickString(
    process.env.ARENA_GROQ_API_KEY,
    process.env.GROQ_API_KEY,
  );
  if (groqKey) {
    try {
      const reply = await callGroq(parsed.messages, groqKey);
      json(res, 200, {
        reply,
        remaining: null,
        requires_auth: false,
        source: "groq",
      });
      return;
    } catch (error) {
      errors.push(`Groq: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const geminiKey = pickString(
    process.env.ARENA_AI_API_KEY,
    process.env.GEMINI_API_KEY,
  );
  if (geminiKey) {
    try {
      const reply = await callGemini(parsed.fullPrompt, geminiKey);
      json(res, 200, {
        reply,
        remaining: null,
        requires_auth: false,
        source: "gemini",
      });
      return;
    } catch (error) {
      errors.push(`Gemini: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const openaiKey = pickString(
    process.env.ARENA_OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
  );
  if (openaiKey) {
    try {
      const reply = await callOpenAI(parsed.messages, openaiKey);
      json(res, 200, {
        reply,
        remaining: null,
        requires_auth: false,
        source: "openai",
      });
      return;
    } catch (error) {
      errors.push(`OpenAI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  json(res, 502, {
    detail: "AI javob berishda xatolik yuz berdi.",
    error: errors.join(" | "),
  });
};
