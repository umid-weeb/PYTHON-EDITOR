(function () {
  const STORAGE_PREFIX = "pyzone_editor_ai_history";
  const TOKEN_KEYS = ["userToken", "auth_token", "token", "arena_jwt", "access_token"];

  const state = {
    open: false,
    loading: false,
    remaining: null,
    contextKey: "python:array",
    messages: [],
  };

  const elements = {
    root: null,
    trigger: null,
    panel: null,
    headerMeta: null,
    context: null,
    status: null,
    messages: null,
    input: null,
    send: null,
    close: null,
  };

  function readStoredToken() {
    try {
      for (const key of TOKEN_KEYS) {
        const token = localStorage.getItem(key);
        if (token) return token;
      }
    } catch {}
    return "";
  }

  function readContext() {
    const fallback = {
      language: "python",
      languageLabel: "Python",
      starterPack: "array",
      starterPackLabel: "ARRAY",
      code: "",
      outputText: "",
      selectedText: "",
      cursorLine: 1,
      cursorColumn: 1,
      lineCount: 0,
      isDarkMode: false,
      consoleInputActive: false,
      consoleInputPrompt: "",
    };

    try {
      const helper = window.pyzoneEditorAssistant;
      if (helper && typeof helper.getContext === "function") {
        return { ...fallback, ...helper.getContext() };
      }
    } catch {}

    return fallback;
  }

  function normalizeOutputText(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    if (/natija .* ko'rsatiladi/i.test(value)) return "";
    if (/natija shu yerda/i.test(value)) return "";
    if (/editor muhiti yuklanmoqda/i.test(value)) return "";
    if (/console/i.test(value) && value.length < 30) return "";
    return value;
  }

  function buildContextKey(ctx) {
    const languageKey = String(ctx?.language || "python").toLowerCase();
    const starterPackKey = String(ctx?.starterPack || "array").toLowerCase();
    return `${languageKey}:${starterPackKey}`;
  }

  function storageKey(contextKey) {
    return `${STORAGE_PREFIX}:${contextKey || "python:array"}`;
  }

  function loadMessages(contextKey) {
    try {
      const raw = localStorage.getItem(storageKey(contextKey));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item === "object" && typeof item.role === "string" && typeof item.text === "string")
        .slice(-16);
    } catch {
      return [];
    }
  }

  function saveMessages() {
    try {
      localStorage.setItem(storageKey(state.contextKey), JSON.stringify(state.messages.slice(-16)));
    } catch {}
  }

  function createInitialMessages(ctx) {
    const intro = `Men hozir ${ctx.languageLabel} kodini ko'rib turibman. Savolingizni yozing.`;

    const details = [`${ctx.languageLabel} | ${ctx.starterPackLabel} | Qator ${ctx.cursorLine}:${ctx.cursorColumn}`];
    if (ctx.consoleInputActive) {
      details.push(`Console input: ${ctx.consoleInputPrompt || "faol"}`);
    }

    return [
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        text: `${intro}\n\n${details.join(" | ")}`,
      },
    ];
  }

  function buildContextSummary(ctx) {
    const parts = [ctx.languageLabel, ctx.starterPackLabel, `Qator ${ctx.cursorLine}:${ctx.cursorColumn}`];
    if (ctx.selectedText && ctx.selectedText.trim()) {
      const selection = ctx.selectedText.trim().replace(/\s+/g, " ");
      parts.push(`Tanlov: ${selection.length > 30 ? `${selection.slice(0, 30)}...` : selection}`);
    }
    if (ctx.consoleInputActive) {
      parts.push(`Input: ${ctx.consoleInputPrompt || "kutilmoqda"}`);
    }
    return parts.join(" | ");
  }

  function ensureHistoryForCurrentContext(force = false) {
    const ctx = readContext();
    const nextContextKey = buildContextKey(ctx);
    const contextChanged = nextContextKey !== state.contextKey;

    if (force || contextChanged || state.messages.length === 0) {
      if (state.messages.length > 0 && state.contextKey) {
        saveMessages();
      }
      state.contextKey = nextContextKey;
      const loaded = loadMessages(nextContextKey);
      state.messages = loaded.length > 0 ? loaded : createInitialMessages(ctx);
      state.remaining = null;
      renderMessages();
    }

    if (elements.context) {
      elements.context.textContent = buildContextSummary(ctx);
    }
    if (elements.status) {
      const remainingText =
        state.remaining !== null
          ? `${state.remaining} qoldi`
          : ctx.isDarkMode
            ? "Qorong'i tema"
            : "Yorug' tema";
      elements.status.textContent = remainingText;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderMessages() {
    if (!elements.messages) return;
    elements.messages.innerHTML = "";

    for (const message of state.messages) {
      const wrapper = document.createElement("div");
      wrapper.className = `editor-ai-message editor-ai-message--${message.role === "user" ? "user" : "assistant"}`;

      const bubble = document.createElement("div");
      bubble.className = "editor-ai-bubble";
      bubble.innerHTML = escapeHtml(message.text).replace(/\n/g, "<br>");

      if (message.role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "editor-ai-avatar";
        avatar.textContent = "AI";
        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
      } else {
        wrapper.appendChild(bubble);
      }

      elements.messages.appendChild(wrapper);
    }

    requestAnimationFrame(() => {
      if (elements.messages) {
        elements.messages.scrollTop = elements.messages.scrollHeight;
      }
    });
  }

  function addMessage(role, text) {
    state.messages.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: String(text || ""),
    });
    renderMessages();
    saveMessages();
  }

  function setLoading(loading) {
    state.loading = loading;
    if (elements.send) {
      elements.send.disabled = loading || !elements.input || !elements.input.value.trim();
      elements.send.textContent = loading ? "Yuborilmoqda..." : "Yuborish";
    }
    if (elements.input) {
      elements.input.disabled = loading;
    }
  }

  function setOpen(nextOpen) {
    state.open = typeof nextOpen === "boolean" ? nextOpen : !state.open;
    if (!elements.root) return;
    elements.root.classList.toggle("is-open", state.open);
    if (state.open) {
      ensureHistoryForCurrentContext();
      setTimeout(() => {
        if (elements.input) elements.input.focus();
      }, 80);
    }
  }

  function buildConversationHistory() {
    return state.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-4)
      .map((message) => ({
        role: message.role,
        content: message.text,
      }));
  }

  function getAuthHeaders() {
    const token = readStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function getRequestPayload(userMessage) {
    const ctx = readContext();
    const outputText = normalizeOutputText(ctx.outputText);

    return {
      language: ctx.language || "python",
      starter_pack: ctx.starterPack || "array",
      code: String(ctx.code || ""),
      selected_text: String(ctx.selectedText || ""),
      output_text: outputText,
      cursor_line: Number(ctx.cursorLine || 1),
      cursor_column: Number(ctx.cursorColumn || 1),
      line_count: Number(ctx.lineCount || 0),
      is_dark_mode: Boolean(ctx.isDarkMode),
      console_input_active: Boolean(ctx.consoleInputActive),
      console_input_prompt: String(ctx.consoleInputPrompt || ""),
      context_tag: `online-editor:${ctx.language || "python"}:${ctx.starterPack || "array"}`,
      user_message: userMessage,
      conversation_history: buildConversationHistory(),
    };
  }

  async function sendMessage(rawValue) {
    if (state.loading) return;

    const value = String(rawValue ?? elements.input?.value ?? "").trim();
    if (!value) return;

    if (state.messages.length === 0) {
      ensureHistoryForCurrentContext(true);
    }

    addMessage("user", value);
    if (elements.input) {
      elements.input.value = "";
    }
    setLoading(true);

    try {
      const response = await fetch("/api/editor/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(getRequestPayload(value)),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || payload.error || `HTTP ${response.status}`);
      }

      if (typeof payload.remaining === "number") {
        state.remaining = payload.remaining;
      }

      if (payload.requires_auth) {
        state.remaining = 0;
        addMessage("assistant", "Bugungi bepul AI limiti tugadi. Ertaga yana urinib ko'ring.");
        return;
      }

      addMessage("assistant", payload.reply || "Javob olishda xatolik yuz berdi.");
    } catch (error) {
      addMessage("assistant", `Xatolik: ${error.message}`);
    } finally {
      setLoading(false);
      ensureHistoryForCurrentContext();
    }
  }

  function applyInputState() {
    const hasText = Boolean(elements.input && elements.input.value.trim());
    if (elements.send) {
      elements.send.disabled = state.loading || !hasText;
    }
  }

  function mountWidget() {
    const root = document.createElement("div");
    root.className = "editor-ai-widget";

    root.innerHTML = `
      <button type="button" class="editor-ai-trigger" aria-label="AI yordamchi">
        <span class="editor-ai-trigger-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2a4 4 0 0 0-4 4v1H6a4 4 0 0 0-4 4v3a4 4 0 0 0 4 4h1v1a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4v-1h1a4 4 0 0 0 4-4v-3a4 4 0 0 0-4-4h-2V6a4 4 0 0 0-4-4Z"/>
            <path d="M9 11h.01M15 11h.01"/>
            <path d="M9 15c.8.7 1.8 1 3 1s2.2-.3 3-1"/>
          </svg>
        </span>
        <span class="editor-ai-trigger-dot"></span>
      </button>
      <section class="editor-ai-panel" aria-label="AI yordamchi paneli">
        <header class="editor-ai-header">
          <div class="editor-ai-header-main">
            <div class="editor-ai-title-row">
              <div class="editor-ai-badge">AI yordamchi</div>
              <span class="editor-ai-status" id="editor-ai-status">Tayyor</span>
            </div>
            <h3 class="editor-ai-title">Kodingiz yonida turaman</h3>
          </div>
          <button type="button" class="editor-ai-close" aria-label="Yopish" title="Yopish">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18"></path>
            </svg>
          </button>
        </header>
        <div class="editor-ai-context" id="editor-ai-context">Kontekst yuklanmoqda...</div>
        <div class="editor-ai-message-list" id="editor-ai-messages"></div>
        <div class="editor-ai-input-shell">
          <textarea id="editor-ai-input" class="editor-ai-input" rows="2" placeholder="Savolingizni yozing..."></textarea>
          <div class="editor-ai-actions">
            <span class="editor-ai-hint">Enter - yuborish, Shift+Enter - yangi qatorda</span>
            <button type="button" class="editor-ai-send">Yuborish</button>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(root);

    elements.root = root;
    elements.trigger = root.querySelector(".editor-ai-trigger");
    elements.panel = root.querySelector(".editor-ai-panel");
    elements.headerMeta = root.querySelector(".editor-ai-header-main");
    elements.context = root.querySelector("#editor-ai-context");
    elements.status = root.querySelector("#editor-ai-status");
    elements.messages = root.querySelector("#editor-ai-messages");
    elements.input = root.querySelector("#editor-ai-input");
    elements.send = root.querySelector(".editor-ai-send");
    elements.close = root.querySelector(".editor-ai-close");

    elements.trigger.addEventListener("click", () => setOpen());
    elements.close.addEventListener("click", () => setOpen(false));
    elements.send.addEventListener("click", () => sendMessage());
    elements.input.addEventListener("input", applyInputState);
    elements.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.open) {
        setOpen(false);
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (!state.open || !elements.root) return;
      const target = event.target;
      if (target instanceof Node && !elements.root.contains(target)) {
        setOpen(false);
      }
    });

    window.addEventListener("pyzone-editor-context-changed", () => {
      ensureHistoryForCurrentContext();
      applyInputState();
    });

    applyInputState();

    setInterval(() => {
      if (!state.open) return;
      ensureHistoryForCurrentContext();
      applyInputState();
    }, 4000);
  }

  function boot() {
    mountWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
