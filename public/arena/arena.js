const DEFAULT_EDITOR_CODE = [
  "class Solution:",
  "    def solve(self):",
  "        pass",
].join("\n");

const ARENA_SPLIT_STORAGE_KEY = "pyzone-arena-split-v2";
const ARENA_SEARCH_DEBOUNCE_MS = 300;

const arenaState = {
  apiBase: window.ARENA_API_BASE || "/api",
  page: 1,
  perPage: 20,
  total: 0,
  totalPages: 1,
  query: "",
  activeTags: new Set(),
  availableTags: [],
  problems: [],
  problemCache: new Map(),
  currentProblem: null,
  currentVisibleTests: [],
  activeTestIndex: 0,
  activeSubmissionId: null,
  pollTimer: null,
  splitInstance: null,
  editorType: "pending",
  editorInstance: null,
  editorReadyPromise: null,
  pendingRequests: 0,
  listRowHeight: 96,
  listOverscan: 4,
  detailLoadToken: null,
};

const arenaElements = {};

document.addEventListener("DOMContentLoaded", () => {
  initializeArena().catch((error) => {
    console.error("Arena initialization failed:", error);
    handleArenaError(error, "Arena yuklanmadi.");
  });
});

async function initializeArena() {
  collectArenaElements();
  configureMarked();
  bindArenaEvents();
  renderProblemListSkeleton();
  showDescriptionSkeleton();
  setEditorLoading(true);
  arenaState.editorReadyPromise = initializeArenaEditor();
  ensureSplitLayout();
  await loadProblems({ page: 1 });
  await arenaState.editorReadyPromise;
}

function collectArenaElements() {
  arenaElements.progress = document.getElementById("arena-progress");
  arenaElements.search = document.getElementById("problem-search");
  arenaElements.pageSize = document.getElementById("page-size");
  arenaElements.refresh = document.getElementById("refresh-problems");
  arenaElements.tagFilters = document.getElementById("tag-filters");
  arenaElements.listMeta = document.getElementById("problem-list-meta");
  arenaElements.pagePrev = document.getElementById("page-prev");
  arenaElements.pageNext = document.getElementById("page-next");
  arenaElements.pageIndicator = document.getElementById("page-indicator");
  arenaElements.listViewport = document.getElementById("problem-list-viewport");
  arenaElements.listInner = document.getElementById("problem-list-inner");
  arenaElements.problemTitle = document.getElementById("problem-title");
  arenaElements.problemDifficulty = document.getElementById("problem-difficulty");
  arenaElements.problemMeta = document.getElementById("problem-meta");
  arenaElements.problemDescription = document.getElementById("problem-description");
  arenaElements.descriptionLoading = document.getElementById("description-loading");
  arenaElements.functionName = document.getElementById("problem-function-name");
  arenaElements.hiddenCount = document.getElementById("problem-hidden-count");
  arenaElements.editorHost = document.getElementById("arena-editor");
  arenaElements.editorFallback = document.getElementById("arena-editor-fallback");
  arenaElements.editorLoading = document.getElementById("editor-loading");
  arenaElements.runButton = document.getElementById("run-solution");
  arenaElements.submitButton = document.getElementById("submit-solution");
  arenaElements.visibleCaseCount = document.getElementById("visible-case-count");
  arenaElements.testcaseTabs = document.getElementById("testcase-tabs");
  arenaElements.testcaseViewer = document.getElementById("testcase-viewer");
  arenaElements.statusChip = document.getElementById("submission-status-chip");
  arenaElements.resultSummary = document.getElementById("result-summary");
  arenaElements.resultDetails = document.getElementById("result-details");
}

function configureMarked() {
  if (window.marked) {
    window.marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }
}

function bindArenaEvents() {
  const debouncedSearch = debounce(() => {
    arenaState.page = 1;
    loadProblems({ page: 1 }).catch((error) => {
      handleArenaError(error, "Problem list yuklanmadi.");
    });
  }, ARENA_SEARCH_DEBOUNCE_MS);

  arenaElements.search.addEventListener("input", (event) => {
    arenaState.query = event.target.value.trim();
    debouncedSearch();
  });

  arenaElements.pageSize.addEventListener("change", (event) => {
    arenaState.perPage = Number(event.target.value) || 20;
    arenaState.page = 1;
    loadProblems({ page: 1 }).catch((error) => {
      handleArenaError(error, "Sahifalash yangilanmadi.");
    });
  });

  arenaElements.refresh.addEventListener("click", () => {
    loadProblems({ page: arenaState.page, forceRefresh: true }).catch((error) => {
      handleArenaError(error, "GitHub refresh bajarilmadi.");
    });
  });

  arenaElements.pagePrev.addEventListener("click", () => {
    if (arenaState.page > 1) {
      loadProblems({ page: arenaState.page - 1 }).catch((error) => {
        handleArenaError(error, "Oldingi sahifa ochilmadi.");
      });
    }
  });

  arenaElements.pageNext.addEventListener("click", () => {
    if (arenaState.page < arenaState.totalPages) {
      loadProblems({ page: arenaState.page + 1 }).catch((error) => {
        handleArenaError(error, "Keyingi sahifa ochilmadi.");
      });
    }
  });

  arenaElements.listViewport.addEventListener("scroll", () => {
    renderVirtualProblemList();
  });

  arenaElements.runButton.addEventListener("click", () => {
    startSubmission("run").catch((error) => {
      handleArenaError(error, "Run bajarilmadi.");
    });
  });

  arenaElements.submitButton.addEventListener("click", () => {
    startSubmission("submit").catch((error) => {
      handleArenaError(error, "Submit bajarilmadi.");
    });
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      ensureSplitLayout();
      renderVirtualProblemList();
      layoutEditor();
    }, 140)
  );

  window.addEventListener("beforeunload", () => {
    clearTimeout(arenaState.pollTimer);
  });
}

async function initializeArenaEditor() {
  setEditorLoading(true);

  try {
    await loadMonaco();
    arenaState.editorType = "monaco";
    arenaState.editorInstance = window.monaco.editor.create(arenaElements.editorHost, {
      value: DEFAULT_EDITOR_CODE,
      language: "python",
      theme: "vs-dark",
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      wordWrap: "on",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      lineNumbersMinChars: 3,
      padding: {
        top: 16,
        bottom: 16,
      },
    });
    arenaElements.editorHost.hidden = false;
    arenaElements.editorFallback.classList.remove("is-visible");
  } catch (error) {
    console.error("Monaco editor failed to load, using textarea fallback.", error);
    arenaState.editorType = "textarea";
    arenaState.editorInstance = arenaElements.editorFallback;
    arenaElements.editorHost.hidden = true;
    arenaElements.editorFallback.classList.add("is-visible");
    arenaElements.editorFallback.value = DEFAULT_EDITOR_CODE;
  } finally {
    setEditorLoading(false);
  }
}

async function loadMonaco() {
  if (window.monaco?.editor) {
    return;
  }

  if (!window.require) {
    throw new Error("Monaco AMD loader topilmadi.");
  }

  const baseUrl = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/";
  window.MonacoEnvironment = {
    getWorkerUrl() {
      const workerSource = [
        `self.MonacoEnvironment = { baseUrl: '${baseUrl}' };`,
        `importScripts('${baseUrl}vs/base/worker/workerMain.js');`,
      ].join("");
      return `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
    },
  };

  await new Promise((resolve, reject) => {
    window.require.config({
      paths: {
        vs: `${baseUrl}vs`,
      },
    });

    window.require(["vs/editor/editor.main"], resolve, reject);
  });
}

function ensureSplitLayout() {
  const shouldSplit = window.innerWidth > 1260 && window.Split;

  if (!shouldSplit) {
    destroySplitLayout();
    return;
  }

  if (arenaState.splitInstance) {
    return;
  }

  const defaultSizes = loadSavedSplitSizes() || [22, 46, 32];
  arenaState.splitInstance = window.Split(
    ["#arena-pane-list", "#arena-pane-description", "#arena-pane-workbench"],
    {
      sizes: defaultSizes,
      minSize: [280, 420, 420],
      gutterSize: 12,
      onDragEnd: (sizes) => {
        saveSplitSizes(sizes);
        layoutEditor();
      },
    }
  );
}

function destroySplitLayout() {
  if (!arenaState.splitInstance) {
    return;
  }

  try {
    arenaState.splitInstance.destroy();
  } catch (error) {
    console.warn("Split destroy warning:", error);
  }

  arenaState.splitInstance = null;
  document.querySelectorAll(".gutter").forEach((node) => node.remove());
  ["arena-pane-list", "arena-pane-description", "arena-pane-workbench"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    element.style.width = "";
    element.style.flexBasis = "";
  });
}

function saveSplitSizes(sizes) {
  try {
    localStorage.setItem(ARENA_SPLIT_STORAGE_KEY, JSON.stringify(sizes));
  } catch (error) {
    console.warn("Split sizes were not saved:", error);
  }
}

function loadSavedSplitSizes() {
  try {
    const raw = localStorage.getItem(ARENA_SPLIT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 3 ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function loadProblems({ page = arenaState.page, forceRefresh = false } = {}) {
  arenaState.page = page;
  renderProblemListSkeleton();
  setPaginationBusy(true);
  setListMeta(forceRefresh ? "GitHub dan yangilanmoqda..." : "Problemlar yuklanmoqda...");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(arenaState.perPage));
  if (arenaState.query) {
    params.set("q", arenaState.query);
  }
  if (arenaState.activeTags.size) {
    params.set("tags", Array.from(arenaState.activeTags).join(","));
  }
  if (forceRefresh) {
    params.set("refresh", "1");
  }

  const response = await fetchArenaJson(`${arenaState.apiBase}/problems?${params.toString()}`);

  arenaState.problems = Array.isArray(response.items) ? response.items : [];
  arenaState.total = response.total || 0;
  arenaState.page = response.page || page;
  arenaState.perPage = response.per_page || arenaState.perPage;
  arenaState.totalPages = response.total_pages || Math.max(1, Math.ceil(arenaState.total / arenaState.perPage));
  arenaState.activeTags = new Set(Array.isArray(response.selected_tags) ? response.selected_tags : Array.from(arenaState.activeTags));
  arenaState.availableTags = Array.isArray(response.available_tags) ? response.available_tags : [];
  arenaElements.pageSize.value = String(arenaState.perPage);

  renderTagFilters();
  updatePaginationControls();
  renderVirtualProblemList(true);

  if (!arenaState.problems.length) {
    arenaState.currentProblem = null;
    arenaElements.problemTitle.textContent = "Problem topilmadi";
    arenaElements.problemDifficulty.textContent = "EMPTY";
    arenaElements.problemMeta.innerHTML = "";
    arenaElements.problemDescription.innerHTML = "";
    arenaElements.problemDescription.classList.remove("is-visible");
    showDescriptionSkeleton();
    setEditorValue(DEFAULT_EDITOR_CODE);
    setEditorLoading(false);
    renderVisibleTestcases([]);
    updateResultPanel("Idle", "", "Filter bo'yicha problem topilmadi.", "");
    return;
  }

  const shouldSelectFirst =
    !arenaState.currentProblem ||
    !arenaState.problems.some((item) => item.id === arenaState.currentProblem.id);

  if (shouldSelectFirst) {
    await loadProblem(arenaState.problems[0].id);
  } else {
    renderVirtualProblemList();
  }
}

function renderTagFilters() {
  const tags = arenaState.availableTags.slice(0, 8);
  arenaElements.tagFilters.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = `filter-chip${arenaState.activeTags.size ? "" : " active"}`;
  allChip.textContent = "All";
  allChip.addEventListener("click", () => {
    arenaState.activeTags.clear();
    arenaState.page = 1;
    loadProblems({ page: 1 }).catch((error) => {
      handleArenaError(error, "Tag filtri yangilanmadi.");
    });
  });
  arenaElements.tagFilters.appendChild(allChip);

  tags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `filter-chip${arenaState.activeTags.has(tag) ? " active" : ""}`;
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      if (arenaState.activeTags.has(tag)) {
        arenaState.activeTags.delete(tag);
      } else {
        arenaState.activeTags.add(tag);
      }
      arenaState.page = 1;
      loadProblems({ page: 1 }).catch((error) => {
        handleArenaError(error, "Tag filtri yangilanmadi.");
      });
    });
    arenaElements.tagFilters.appendChild(chip);
  });
}

function updatePaginationControls() {
  arenaElements.pageIndicator.textContent = `${arenaState.page} / ${arenaState.totalPages}`;
  arenaElements.pagePrev.disabled = arenaState.page <= 1;
  arenaElements.pageNext.disabled = arenaState.page >= arenaState.totalPages;
  setListMeta(
    `${arenaState.total} ta easy problem${arenaState.query ? ` | q="${arenaState.query}"` : ""}`
  );
}

function setListMeta(text) {
  arenaElements.listMeta.textContent = text;
}

function setPaginationBusy(isBusy) {
  arenaElements.refresh.disabled = isBusy;
  arenaElements.pagePrev.disabled = isBusy || arenaState.page <= 1;
  arenaElements.pageNext.disabled = isBusy || arenaState.page >= arenaState.totalPages;
  arenaElements.pageSize.disabled = isBusy;
}

function renderProblemListSkeleton(count = 10) {
  arenaElements.listInner.innerHTML = "";
  arenaElements.listViewport.scrollTop = 0;
  arenaElements.listInner.style.height = `${count * arenaState.listRowHeight}px`;
  for (let index = 0; index < count; index += 1) {
    const row = document.createElement("div");
    row.className = "problem-skeleton";
    row.style.top = `${index * arenaState.listRowHeight + 6}px`;
    arenaElements.listInner.appendChild(row);
  }
}

function renderVirtualProblemList(resetScroll = false) {
  const items = arenaState.problems;
  const viewport = arenaElements.listViewport;
  const inner = arenaElements.listInner;

  if (resetScroll) {
    viewport.scrollTop = 0;
  }

  if (!items.length) {
    inner.innerHTML = '<div class="empty-state">Qidiruv bo\'yicha problem topilmadi.</div>';
    inner.style.height = "100%";
    setPaginationBusy(false);
    return;
  }

  const viewportHeight = viewport.clientHeight || 540;
  const scrollTop = viewport.scrollTop;
  const rowHeight = arenaState.listRowHeight;
  const overscan = arenaState.listOverscan;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  inner.innerHTML = "";
  inner.style.height = `${items.length * rowHeight}px`;

  for (let index = startIndex; index < endIndex; index += 1) {
    const problem = items[index];
    const item = document.createElement("button");
    item.type = "button";
    item.className = `problem-list-item${
      arenaState.currentProblem?.id === problem.id ? " active" : ""
    }`;
    item.style.top = `${index * rowHeight + 6}px`;
    item.innerHTML = buildProblemCard(problem);
    item.addEventListener("click", () => {
      loadProblem(problem.id).catch((error) => {
        handleArenaError(error, "Problem ochilmadi.");
      });
    });
    inner.appendChild(item);
  }

  setPaginationBusy(false);
}

function buildProblemCard(problem) {
  const preview = problem.preview || `${(problem.tags || []).slice(0, 3).join(", ") || "python"} | ${problem.time_limit_seconds || 1}s`;
  return `
    <div class="problem-list-title">${escapeHtml(problem.title)}</div>
    <div class="problem-list-snippet">${escapeHtml(preview)}</div>
    <div class="problem-list-meta-row">
      <span class="meta-inline">
        <span class="difficulty-pill">${escapeHtml((problem.difficulty || "easy").toUpperCase())}</span>
        <span>${escapeHtml((problem.tags || []).slice(0, 2).join(", ") || "untagged")}</span>
      </span>
      <span>${problem.acceptance_rate != null ? `${problem.acceptance_rate}%` : "easy set"}</span>
    </div>
  `;
}

async function loadProblem(problemId, { forceRefresh = false, prefetch = false } = {}) {
  const cached = !forceRefresh ? arenaState.problemCache.get(problemId) : null;
  if (cached) {
    if (prefetch) {
      return;
    }
    await applyProblemDetail(cached);
    prefetchNeighborProblems(problemId);
    return;
  }

  if (!prefetch) {
    showDescriptionSkeleton();
    setEditorLoading(true);
    updateResultPanel("Loading", "status-warning", "Masala yuklanmoqda...", "");
  }

  const token = prefetch ? null : Symbol(problemId);
  if (!prefetch) {
    arenaState.detailLoadToken = token;
  }
  const suffix = forceRefresh ? "?refresh=1" : "";
  const problem = await fetchArenaJson(
    `${arenaState.apiBase}/problem/${encodeURIComponent(problemId)}${suffix}`
  );

  if (!prefetch && arenaState.detailLoadToken !== token) {
    return;
  }

  arenaState.problemCache.set(problemId, problem);
  if (prefetch) {
    return;
  }
  await applyProblemDetail(problem);
  prefetchNeighborProblems(problemId);
}

async function applyProblemDetail(problem) {
  arenaState.currentProblem = problem;
  arenaState.currentVisibleTests = Array.isArray(problem.visible_testcases)
    ? problem.visible_testcases
    : [];
  arenaState.activeTestIndex = 0;

  arenaElements.problemTitle.textContent = problem.title || problem.id;
  arenaElements.problemDifficulty.textContent = (problem.difficulty || "easy").toUpperCase();
  arenaElements.functionName.textContent = problem.function_name || "Solution";
  arenaElements.hiddenCount.textContent = `${problem.hidden_testcase_count || 0} hidden`;
  arenaElements.problemMeta.innerHTML = [
    problem.time_limit_seconds ? `Time limit: ${problem.time_limit_seconds}s` : "",
    problem.memory_limit_mb ? `Memory limit: ${problem.memory_limit_mb} MB` : "",
    problem.input_format ? `Input: ${escapeHtml(problem.input_format)}` : "",
    problem.output_format ? `Output: ${escapeHtml(problem.output_format)}` : "",
    Array.isArray(problem.tags) && problem.tags.length
      ? `Tags: ${escapeHtml(problem.tags.join(", "))}`
      : "",
  ]
    .filter(Boolean)
    .join("<br>");

  arenaElements.problemDescription.innerHTML = window.marked
    ? window.marked.parse(problem.description || "")
    : escapeHtml(problem.description || "");
  arenaElements.problemDescription.classList.add("is-visible");
  hideDescriptionSkeleton();
  renderVisibleTestcases(problem.visible_testcases || []);
  updateResultPanel("Idle", "", "Run yoki Submit tugmasini bosing.", "");

  await arenaState.editorReadyPromise;
  setEditorValue(problem.starter_code || DEFAULT_EDITOR_CODE);
  focusEditor();
  setEditorLoading(false);
  renderVirtualProblemList();
}

function prefetchNeighborProblems(problemId) {
  const currentIndex = arenaState.problems.findIndex((item) => item.id === problemId);
  const targets = [arenaState.problems[currentIndex - 1], arenaState.problems[currentIndex + 1]]
    .filter(Boolean)
    .filter((problem) => !arenaState.problemCache.has(problem.id));

  targets.forEach((problem) => {
    loadProblem(problem.id, { prefetch: true }).catch(() => {});
  });
}

function showDescriptionSkeleton() {
  arenaElements.descriptionLoading.classList.remove("is-hidden");
  arenaElements.problemDescription.classList.remove("is-visible");
}

function hideDescriptionSkeleton() {
  arenaElements.descriptionLoading.classList.add("is-hidden");
  arenaElements.problemDescription.classList.add("is-visible");
}

function setEditorLoading(isLoading) {
  arenaElements.editorLoading.classList.toggle("is-hidden", !isLoading);
}

function renderVisibleTestcases(testcases = arenaState.currentVisibleTests) {
  arenaState.currentVisibleTests = testcases;
  arenaElements.visibleCaseCount.textContent = `${testcases.length} case`;
  arenaElements.testcaseTabs.innerHTML = "";

  if (!testcases.length) {
    arenaElements.testcaseViewer.textContent = "Visible testcase topilmadi.";
    return;
  }

  testcases.forEach((testcase, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `testcase-tab${index === arenaState.activeTestIndex ? " active" : ""}`;
    tab.textContent = testcase.name || `Case ${index + 1}`;
    tab.addEventListener("click", () => {
      arenaState.activeTestIndex = index;
      renderVisibleTestcases();
    });
    arenaElements.testcaseTabs.appendChild(tab);
  });

  const activeCase = testcases[arenaState.activeTestIndex] || testcases[0];
  arenaElements.testcaseViewer.textContent = [
    `Input\n${activeCase.input || "(empty)"}`,
    `Expected Output\n${activeCase.expected_output || "(empty)"}`,
  ].join("\n\n");
}

async function startSubmission(mode) {
  if (!arenaState.currentProblem) {
    updateResultPanel("Xatolik", "status-error", "Avval problem tanlang.", "");
    return;
  }

  const code = getEditorValue();
  if (!code.trim()) {
    updateResultPanel("Xatolik", "status-error", "Kod bo'sh.", "Starter code yoki yechim kiriting.");
    return;
  }

  setArenaBusy(true);
  updateResultPanel(
    mode === "submit" ? "Submitting" : "Running",
    "status-warning",
    mode === "submit"
      ? "Submission queue ga yuborildi..."
      : "Visible testlar ishga tushirildi...",
    ""
  );

  const response = await fetchArenaJson(`${arenaState.apiBase}/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      problem_id: arenaState.currentProblem.id,
      code,
      language: "python",
    }),
  });

  arenaState.activeSubmissionId = response.submission_id;
  await pollSubmission(response.submission_id);
}

async function pollSubmission(submissionId) {
  clearTimeout(arenaState.pollTimer);

  const payload = await fetchArenaJson(
    `${arenaState.apiBase}/submission/${encodeURIComponent(submissionId)}`
  );

  if (payload.status === "queued" || payload.status === "running") {
    updateResultPanel(
      payload.status === "running" ? "Running" : "Queued",
      "status-warning",
      buildLiveSummary(payload),
      "Judge worker testcase'larni ishlayapti..."
    );
    arenaState.pollTimer = setTimeout(() => {
      pollSubmission(submissionId).catch((error) => {
        handleArenaError(error, "Submission polling yiqildi.");
      });
    }, 900);
    return;
  }

  setArenaBusy(false);
  renderSubmissionResult(payload);
}

function renderSubmissionResult(payload) {
  const verdict = payload.verdict || payload.status || "Unknown";
  const statusClass =
    verdict === "Accepted" ? "status-success" : verdict === "Idle" ? "" : "status-error";

  const summaryLines = [
    verdict,
    payload.runtime_ms != null ? `Runtime: ${payload.runtime_ms} ms` : "",
    payload.memory_kb != null
      ? `Memory: ${Math.max(1, Math.round(payload.memory_kb / 1024))} MB`
      : "",
    payload.total_count != null ? `Passed: ${payload.passed_count || 0} / ${payload.total_count}` : "",
  ].filter(Boolean);

  const caseResults = Array.isArray(payload.case_results) ? payload.case_results : [];
  const details = caseResults.length
    ? caseResults
        .map((item, index) => {
          const blocks = [
            `${item.name || `Case ${index + 1}`}: ${item.verdict || (item.passed ? "Passed" : "Failed")}`,
            item.hidden ? "Hidden testcase" : item.input ? `Input:\n${item.input}` : "",
            item.hidden ? "" : item.expected_output ? `Expected:\n${item.expected_output}` : "",
            item.actual_output ? `Actual:\n${item.actual_output}` : "",
            item.error ? `Error:\n${item.error}` : "",
          ].filter(Boolean);
          return blocks.join("\n");
        })
        .join("\n\n----------------\n\n")
    : payload.error_text || "Judge tafsilot bermadi.";

  updateResultPanel(verdict, statusClass, summaryLines.join("\n"), details);
}

function buildLiveSummary(payload) {
  return [
    payload.status === "running" ? "Judge ishlayapti..." : "Queue'da kutyapti...",
    payload.problem_id ? `Problem: ${payload.problem_id}` : "",
    payload.mode ? `Mode: ${payload.mode}` : "",
    payload.created_at ? `Queued: ${new Date(payload.created_at).toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function updateResultPanel(label, statusClass, summary, details) {
  arenaElements.statusChip.textContent = label;
  arenaElements.statusChip.className = `result-chip${statusClass ? ` ${statusClass}` : ""}`;
  arenaElements.resultSummary.textContent = summary || "";
  arenaElements.resultDetails.textContent = details || "";
}

function setArenaBusy(isBusy) {
  arenaElements.runButton.disabled = isBusy;
  arenaElements.submitButton.disabled = isBusy;
  arenaElements.refresh.disabled = isBusy;
}

async function fetchArenaJson(url, options = {}) {
  beginNetworkActivity();

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      if (contentType.includes("application/json")) {
        const errorPayload = await response.json();
        message = errorPayload.detail || errorPayload.message || JSON.stringify(errorPayload);
      } else {
        message = (await response.text()) || message;
      }
      throw new Error(message);
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return JSON.parse(await response.text());
  } finally {
    endNetworkActivity();
  }
}

function beginNetworkActivity() {
  arenaState.pendingRequests += 1;
  arenaElements.progress.classList.add("is-active");
}

function endNetworkActivity() {
  arenaState.pendingRequests = Math.max(0, arenaState.pendingRequests - 1);
  if (arenaState.pendingRequests === 0) {
    arenaElements.progress.classList.remove("is-active");
  }
}

function handleArenaError(error, summary) {
  console.error(error);
  setArenaBusy(false);
  setPaginationBusy(false);
  updateResultPanel(
    "Xatolik",
    "status-error",
    summary,
    error instanceof Error ? error.message : String(error)
  );
}

function getEditorValue() {
  if (arenaState.editorType === "monaco" && arenaState.editorInstance) {
    return arenaState.editorInstance.getValue();
  }
  return arenaElements.editorFallback.value || "";
}

function setEditorValue(value) {
  if (arenaState.editorType === "monaco" && arenaState.editorInstance) {
    arenaState.editorInstance.setValue(value);
    return;
  }
  arenaElements.editorFallback.value = value;
}

function focusEditor() {
  if (arenaState.editorType === "monaco" && arenaState.editorInstance) {
    arenaState.editorInstance.focus();
    return;
  }
  arenaElements.editorFallback.focus();
}

function layoutEditor() {
  if (arenaState.editorType === "monaco" && arenaState.editorInstance) {
    arenaState.editorInstance.layout();
  }
}

function debounce(callback, delay) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
