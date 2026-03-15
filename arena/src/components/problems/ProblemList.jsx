const difficulties = [
  { id: "all", label: "All" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

const filterToneClass = {
  all: "text-arena-text",
  easy: "text-arena-success",
  medium: "text-arena-warning",
  hard: "text-arena-danger",
};

const difficultyPillClass = {
  easy: "text-arena-success",
  medium: "text-arena-warning",
  hard: "text-arena-danger",
};

export default function ProblemList({
  problems,
  loading,
  search,
  difficulty,
  selectedProblemId,
  onSearchChange,
  onDifficultyChange,
  onSelect,
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="shrink-0 border-b border-arena-border px-[22px] py-[22px]">
        <div className="mb-2.5 text-xs uppercase tracking-[0.08em] text-arena-muted">Search</div>
        <input
          className="w-full rounded-2xl border border-arena-border bg-white/5 px-4 py-[14px] text-arena-text outline-none transition focus:border-arena-borderStrong focus:ring-4 focus:ring-[rgba(108,146,255,0.1)]"
          placeholder="Search problems"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <div className="my-4 grid grid-cols-2 gap-2.5">
          {difficulties.map((item) => (
            <button
              key={item.id}
              className={[
                "rounded-full border px-3.5 py-3 text-sm transition",
                difficulty === item.id
                  ? "border-arena-borderStrong bg-[rgba(108,146,255,0.14)] text-arena-text"
                  : `border-arena-border bg-transparent ${filterToneClass[item.id]}`,
              ].join(" ")}
              type="button"
              onClick={() => onDifficultyChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-arena-muted">
          {problems.length} problem{problems.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-[18px]">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-[110px] animate-pulse rounded-[22px] bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.07),rgba(255,255,255,0.03))] bg-[length:200%_100%]"
              />
            ))
          : problems.map((problem) => (
              <button
                key={problem.slug || problem.id}
                className={[
                  "grid w-full gap-3 rounded-[20px] border p-4 text-left text-arena-text transition",
                  selectedProblemId === (problem.slug || problem.id)
                    ? "border-arena-borderStrong bg-[rgba(108,146,255,0.1)]"
                    : "border-arena-border bg-white/5 hover:border-arena-borderStrong hover:bg-[rgba(108,146,255,0.1)]",
                ].join(" ")}
                type="button"
                onClick={() => onSelect(problem.slug || problem.id)}
              >
                <div className="font-semibold">{problem.title || problem.id}</div>
                <div className="flex items-center justify-between gap-3 text-sm text-arena-muted">
                  <span
                    className={[
                      "inline-flex items-center rounded-full border border-current px-2.5 py-1 text-[0.72rem] font-medium",
                      difficultyPillClass[(problem.difficulty || "easy").toLowerCase()] || difficultyPillClass.easy,
                    ].join(" ")}
                  >
                    {String(problem.difficulty || "easy").toUpperCase()}
                  </span>
                  <span>{problem.slug || problem.id}</span>
                </div>
              </button>
            ))}
        {!loading && problems.length === 0 ? (
          <div className="px-2 py-2 text-sm text-arena-muted">No problems match the current filters.</div>
        ) : null}
      </div>
    </div>
  );
}
