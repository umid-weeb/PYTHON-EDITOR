export function formatJoinedDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

export function formatRuntime(runtimeMs) {
  if (runtimeMs == null) return "--";
  if (runtimeMs >= 1000) return `${(runtimeMs / 1000).toFixed(2)} s`;
  return `${runtimeMs} ms`;
}

export function formatMemory(memoryKb) {
  if (memoryKb == null) return "--";
  if (memoryKb >= 1024) return `${(memoryKb / 1024).toFixed(1)} MB`;
  return `${Math.round(memoryKb)} KB`;
}

export function formatCaseResults(cases = []) {
  if (!cases.length) return [];
  return cases.map((entry, index) => {
    const verdict = entry.verdict || (entry.passed ? "Accepted" : "Wrong Answer");
    return {
      id: `${index + 1}`,
      label: `Case ${index + 1}`,
      verdict: entry.error ? `${verdict}: ${entry.error}` : verdict,
      runtime: formatRuntime(entry.runtime_ms),
      memory: formatMemory(entry.memory_kb),
    };
  });
}

function resolveResultTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("accepted")) return "success";
  if (normalized.includes("wrong")) return "danger";
  if (normalized.includes("runtime")) return "warning";
  if (normalized.includes("time")) return "warning";
  if (normalized.includes("memory")) return "warning";
  if (normalized.includes("compilation")) return "warning";
  return "info";
}

export function buildResultState(payload, mode = "run") {
  if (!payload) {
    return {
      tone: "info",
      chip: "Info",
      summary: "No result yet.",
      details: [],
    };
  }

  const status = payload.verdict || payload.status || (payload.ok ? "Accepted" : "Result");
  const details = payload.output
    ? [{ id: "output", label: "Console Output", verdict: payload.output, runtime: "", memory: "" }]
    : formatCaseResults(payload.case_results);

  const summaryParts = [];
  if (typeof payload.passed_count === "number" && typeof payload.total_count === "number") {
    summaryParts.push(`Passed ${payload.passed_count}/${payload.total_count}`);
  }
  summaryParts.push(`Runtime: ${formatRuntime(payload.runtime_ms)}`);
  summaryParts.push(`Memory: ${formatMemory(payload.memory_kb)}`);

  return {
    tone: resolveResultTone(status),
    chip: status,
    summary:
      payload.error_text && String(status).toLowerCase() !== "accepted"
        ? payload.error_text
        : summaryParts.join(" | ") || (mode === "submit" ? "Submission finished." : "Execution finished."),
    details,
  };
}

export function buildActivityHeatmap(items = []) {
  const counts = new Map();
  items.forEach((entry) => {
    if (entry?.date) {
      counts.set(entry.date.slice(0, 10), Number(entry.count || 0));
    }
  });

  const days = [];
  const today = new Date();
  for (let index = 182; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - index);
    const iso = current.toISOString().slice(0, 10);
    const count = counts.get(iso) || 0;
    days.push({
      date: iso,
      count,
      level: count >= 5 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0,
    });
  }
  return days;
}

export function calculateAcceptanceRate(submissions = []) {
  if (!submissions.length) return null;
  const accepted = submissions.filter((entry) =>
    String(entry.status || entry.verdict || "").toLowerCase().includes("accepted")
  ).length;
  return Math.round((accepted / submissions.length) * 100);
}

export function calculateCurrentStreak(days = []) {
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].count > 0) streak += 1;
    else break;
  }
  return streak;
}

export function calculateBestStreak(days = []) {
  let best = 0;
  let current = 0;
  days.forEach((day) => {
    if (day.count > 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  });
  return best;
}
