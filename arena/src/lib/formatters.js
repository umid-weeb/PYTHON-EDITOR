export function formatJoinedDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

export function formatRuntime(runtimeMs) {
  return runtimeMs ? `${runtimeMs} ms` : "--";
}

export function formatMemory(memoryKb) {
  return memoryKb ? `${Math.round(memoryKb)} KB` : "--";
}

export function formatCaseResults(cases = []) {
  if (!cases.length) return [];
  return cases.map((entry, index) => {
    const verdict = entry.verdict || (entry.passed ? "Accepted" : "Wrong Answer");
    return {
      id: `${index + 1}`,
      label: `Case ${index + 1}`,
      verdict,
      runtime: formatRuntime(entry.runtime_ms),
      memory: formatMemory(entry.memory_kb),
    };
  });
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

  const status =
    mode === "submit"
      ? payload.verdict || payload.status || "Result"
      : payload.status || (payload.ok ? "Accepted" : "Output");
  const normalized = status.toLowerCase();
  let tone = "info";
  if (normalized.includes("accepted")) tone = "success";
  else if (normalized.includes("wrong")) tone = "danger";
  else if (normalized.includes("runtime")) tone = "warning";
  else if (normalized.includes("time")) tone = "warning";

  const details =
    mode === "submit"
      ? formatCaseResults(payload.case_results)
      : payload.output
        ? [{ id: "output", label: "Console Output", verdict: payload.output, runtime: "", memory: "" }]
        : formatCaseResults(payload.case_results);

  return {
    tone,
    chip: status,
    summary: `${status} • Runtime: ${formatRuntime(payload.runtime_ms)} • Memory: ${formatMemory(payload.memory_kb)}`,
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
