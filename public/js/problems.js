import { getProblems, getProblem } from "./api.js";
import { setCode } from "./editor.js";
import { renderResultMessage } from "./runner.js";

const state = {
  problems: [],
  current: null,
  cache: new Map(),
  filter: { query: "", difficulty: "all" },
};

export async function loadProblemList(ui) {
  ui.listSkeleton.hidden = false;
  ui.listContainer.innerHTML = "";
  try {
    const data = await getProblems();
    state.problems = Array.isArray(data.items) ? data.items : data;
    renderProblemList(ui);
    ui.listSkeleton.hidden = true;
    return state.problems;
  } catch (error) {
    ui.listSkeleton.hidden = true;
    renderResultMessage(ui, "Backend connection error");
    throw error;
  }
}

export function renderProblemList(ui) {
  ui.listContainer.innerHTML = "";
  const filtered = applyFilters();
  filtered.forEach((problem) => {
    const item = document.createElement("button");
    item.className = "problem-card";
    item.innerHTML = `
      <div class="problem-title">${escapeHtml(problem.title || problem.id)}</div>
      <div class="problem-meta">
        <span class="pill pill-${(problem.difficulty || "easy").toLowerCase()}">
          ${(problem.difficulty || "EASY").toUpperCase()}
        </span>
        <span class="problem-id">${problem.id}</span>
      </div>
    `;
    item.addEventListener("click", () => openProblem(ui, problem.id));
    ui.listContainer.appendChild(item);
  });
  if (ui.listMeta) {
    ui.listMeta.textContent = filtered.length ? `${filtered.length} problem` : "No problems found";
  }
}

export async function openProblem(ui, problemId) {
  if (!problemId) return;
  if (state.cache.has(problemId)) {
    await renderProblemDetail(ui, state.cache.get(problemId));
    return;
  }
  ui.problemSkeleton.hidden = false;
  ui.description.innerHTML = "";
  try {
    const data = await getProblem(problemId);
    state.cache.set(problemId, data);
    await renderProblemDetail(ui, data);
  } catch (error) {
    renderResultMessage(ui, "Backend connection error");
    throw error;
  } finally {
    ui.problemSkeleton.hidden = true;
  }
}

async function renderProblemDetail(ui, data) {
  state.current = data;
  localStorage.setItem("arena_last_problem", data.id);
  ui.title.textContent = data.title || data.id;
  ui.difficulty.textContent = (data.difficulty || "easy").toUpperCase();
  ui.difficulty.className = `pill pill-${(data.difficulty || "easy").toLowerCase()}`;
  ui.meta.innerHTML = [
    data.time_limit_seconds ? `Time: ${data.time_limit_seconds}s` : "",
    data.memory_limit_mb ? `Memory: ${data.memory_limit_mb}MB` : "",
    data.tags ? `Tags: ${data.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  ui.description.innerHTML = window.marked
    ? window.marked.parse(data.description || "")
    : escapeHtml(data.description || "");
  ui.visibleTests.textContent = "";
  (data.visible_testcases || []).forEach((tc, idx) => {
    const block = document.createElement("div");
    block.className = "testcase-block";
    block.innerHTML = `
      <div class="testcase-title">Case ${idx + 1}</div>
      <pre><strong>Input</strong>\n${escapeHtml(tc.input || "")}</pre>
      <pre><strong>Expected</strong>\n${escapeHtml(tc.expected_output || "")}</pre>
    `;
    ui.visibleTests.appendChild(block);
  });
  if (ui.visibleCaseCount) {
    ui.visibleCaseCount.textContent = `${(data.visible_testcases || []).length} case`;
  }
  setCode(data.starter_code, data.id);
  renderResultMessage(ui, "Ready. Write code and Run or Submit.");
  highlightCurrentProblem(ui, data.id);
}

export function getCurrentProblemId() {
  return state.current?.id;
}

function highlightCurrentProblem(ui, problemId) {
  Array.from(ui.listContainer.children).forEach((node) => {
    if (node.querySelector(".problem-id")?.textContent === problemId) {
      node.classList.add("is-active");
    } else {
      node.classList.remove("is-active");
    }
  });
}

export function updateSearch(query = "") {
  state.filter.query = query.toLowerCase();
}

export function updateDifficulty(diff = "all") {
  state.filter.difficulty = diff;
}

function applyFilters() {
  return state.problems.filter((p) => {
    const matchesQuery =
      !state.filter.query ||
      (p.title || "").toLowerCase().includes(state.filter.query) ||
      (p.id || "").toLowerCase().includes(state.filter.query);
    const matchesDiff = state.filter.difficulty === "all" || (p.difficulty || "all").toLowerCase() === state.filter.difficulty;
    return matchesQuery && matchesDiff;
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
