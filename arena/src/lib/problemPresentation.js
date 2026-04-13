const difficultyLabels = {
  easy: "Oson",
  medium: "O'rtacha",
  hard: "Qiyin",
};

const tagLabels = {
  array: "Massiv",
  math: "Matematika",
  string: "Satr",
  hashmap: "Xesh jadval",
  sorting: "Saralash",
  stack: "Stek",
  "two-pointers": "Ikki ko'rsatkich",
  "binary-search": "Ikkilik qidiruv",
  "dynamic-programming": "Dinamik dasturlash",
  recursion: "Rekursiya",
  "sliding-window": "Sirpanuvchi oyna",
  trees: "Daraxtlar",
  graphs: "Graflar",
  greedy: "Ochko'z algoritm",
  intervals: "Oraliqlar",
  "bit-manipulation": "Bit amallari",
  backtracking: "Ortga qaytish",
  heap: "Uyum",
  "heap / priority queue": "Uyum / ustuvor navbat",
  tries: "Trie",
  trees: "Daraxtlar",
  graphs: "Graflar",
  intervals: "Oraliqlar",
  sql: "SQL",
  postgresql: "PostgreSQL",
  "basic-joins": "Basic Joins",
  aggregation: "Aggregation",
  grouping: "Grouping",
  subqueries: "Subqueries",
  "linked list": "Bog'langan ro'yxat",
  "linked-list": "Bog'langan ro'yxat",
};

export function localizeDifficultyLabel(difficulty) {
  const normalized = String(difficulty || "").trim().toLowerCase();
  return difficultyLabels[normalized] || "Noma'lum";
}

export function localizeTagLabel(tag) {
  const raw = String(tag || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  return tagLabels[normalized] || raw;
}

export function formatProblemTitle(problem) {
  const title = String(problem?.title || problem?.id || "Nomsiz masala").trim();
  const orderIndex = Number(problem?.order_index || 0);
  return orderIndex > 0 ? `${orderIndex}. ${title}` : title;
}
