import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatMemory, formatRuntime } from "../../lib/formatters.js";
import { getMySubmissions, hydrateSubmissionRows } from "../../services/profileService";
import ProblemDescription from "../problem/ProblemDescription.tsx";

const DIFFICULTY_FILTERS = [
  { id: "all", label: "All" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

const TABS = [
  { id: "description", label: "Description" },
  { id: "submissions", label: "Submissions" },
];

function getProblemKey(problem) {
  return problem?.slug || problem?.id || "";
}

function difficultyBadgeClass(difficulty) {
  const normalized = String(difficulty || "").toLowerCase();
  if (normalized === "easy") return "bg-[var(--easy-bg)] text-[var(--easy)]";
  if (normalized === "medium") return "bg-[var(--medium-bg)] text-[var(--medium)]";
  if (normalized === "hard") return "bg-[var(--hard-bg)] text-[var(--hard)]";
  return "bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("accepted")) return "bg-[var(--success-bg)] text-[var(--success)]";
  if (normalized.includes("wrong") || normalized.includes("error")) return "bg-[var(--error-bg)] text-[var(--error)]";
  if (normalized.includes("running") || normalized.includes("queued") || normalized.includes("pending")) {
    return "bg-[var(--warning-bg)] text-[var(--warning)]";
  }
  return "bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
}

function EmptyStateCard({ eyebrow, title, copy, action }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-[420px] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{eyebrow}</div>
        <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{copy}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

function SubmissionPanel({ username, rows, status }) {
  const acceptedCount = rows.filter((row) => String(row.status || row.verdict || "").toLowerCase().includes("accepted")).length;
  const fastestAccepted = rows
    .filter((row) => String(row.status || row.verdict || "").toLowerCase().includes("accepted") && row.runtime_ms != null)
    .sort((left, right) => Number(left.runtime_ms || 0) - Number(right.runtime_ms || 0))[0];

  if (!username) {
    return (
      <EmptyStateCard
        eyebrow="Submissions"
        title="Login to see your real submission history"
        copy="Bu tab current problem uchun aynan sizning runtime, memory va verdict tarixingizni ko‘rsatadi. Login qilgach shu joy avtomatik real data bilan to‘ladi."
        action={
          <Link
            className="inline-flex h-[var(--h-btn-md)] items-center border border-[color:var(--border)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
            to="/login"
          >
            Open login
          </Link>
        }
      />
    );
  }

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-secondary)]">
        Loading problem submissions...
      </div>
    );
  }

  if (status === "error") {
    return (
      <EmptyStateCard
        eyebrow="Submissions"
        title="Could not load problem submissions"
        copy="Submission tarixi hozircha olinmadi. API ni qayta tekshirib ko'ring yoki sahifani yangilang."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyStateCard
        eyebrow="Submissions"
        title="No submissions for this problem yet"
        copy="Bu masala uchun hali submission yozilmagan. Run yoki Submit qilganingizdan keyin shu yerda real history chiqadi."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 gap-3 border-b border-[color:var(--border)] p-4 md:grid-cols-3">
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Total submissions</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--text-primary)]">{rows.length}</div>
        </div>
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Accepted</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--success)]">{acceptedCount}</div>
        </div>
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Fastest accepted</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--text-primary)]">
            {fastestAccepted ? formatRuntime(fastestAccepted.runtime_ms) : "--"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {rows.map((submission, index) => {
            const verdict = String(submission.status || submission.verdict || "pending");
            return (
              <div
                key={`${submission.submission_id || submission.created_at || submission.problem_id}-${index}`}
                className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">{submission.problem_title || submission.problem_id}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>{submission.language || "unknown"}</span>
                      <span>{submission.created_at ? new Date(submission.created_at).toLocaleString() : "--"}</span>
                    </div>
                  </div>
                  <span className={["inline-flex h-[22px] items-center px-2 text-[11px] font-semibold uppercase tracking-[0.05em]", statusTone(verdict)].join(" ")}>
                    {verdict}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-[12px] text-[var(--text-secondary)] sm:grid-cols-3">
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Runtime: <span className="font-medium text-[var(--text-primary)]">{formatRuntime(submission.runtime_ms)}</span>
                  </div>
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Memory: <span className="font-medium text-[var(--text-primary)]">{formatMemory(submission.memory_kb)}</span>
                  </div>
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Difficulty: <span className="font-medium text-[var(--text-primary)]">{submission.difficulty || "--"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ProblemWorkspacePanel({
  problem,
  loading,
  problems,
  selectedProblemId,
  search,
  difficulty,
  user,
  dailyChallenge,
  onSearchChange,
  onDifficultyChange,
  onSelectProblem,
  onOpenDaily,
}) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  const [submissionStatus, setSubmissionStatus] = useState("idle");
  const [submissionRows, setSubmissionRows] = useState([]);

  const currentProblemKey = problem?.slug || problem?.id || selectedProblemId || "";
  const currentIndex = useMemo(
    () => problems.findIndex((item) => getProblemKey(item) === currentProblemKey),
    [currentProblemKey, problems]
  );
  const currentProblemIds = useMemo(
    () => new Set([problem?.id, problem?.slug, selectedProblemId].filter(Boolean)),
    [problem?.id, problem?.slug, selectedProblemId]
  );
  const currentTitle = problem?.title || "Select a problem";
  const currentDifficulty = String(problem?.difficulty || "").toUpperCase();
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < problems.length - 1;

  useEffect(() => {
    setActiveTab("description");
  }, [currentProblemKey]);

  useEffect(() => {
    if (!browserOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setBrowserOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [browserOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadProblemSubmissions() {
      if (!user?.username || !currentProblemIds.size) {
        setSubmissionRows([]);
        setSubmissionStatus("idle");
        return;
      }

      setSubmissionStatus("loading");
      try {
        const rows = await getMySubmissions().then(hydrateSubmissionRows);
        const filtered = rows.filter((row) => currentProblemIds.has(row.problem_id) || currentProblemIds.has(row.problem_slug));
        if (!cancelled) {
          setSubmissionRows(filtered);
          setSubmissionStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setSubmissionRows([]);
          setSubmissionStatus("error");
        }
      }
    }

    loadProblemSubmissions().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentProblemIds, user?.username]);

  async function handleProblemSelect(problemId) {
    if (!problemId) return;
    await onSelectProblem(problemId);
    setBrowserOpen(false);
  }

  async function handleShift(direction) {
    if (currentIndex < 0) return;
    const target = problems[currentIndex + direction];
    if (!target) return;
    await handleProblemSelect(getProblemKey(target));
  }

  async function handleDailyOpen() {
    if (!dailyChallenge?.problem?.slug) return;
    await onOpenDaily();
    setBrowserOpen(false);
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3">
        <button
          className="inline-flex h-[30px] items-center gap-2 border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
          type="button"
          onClick={() => setBrowserOpen(true)}
        >
          <span>List</span>
          <span>Problems</span>
        </button>

        <button
          className="inline-flex h-[30px] items-center gap-2 border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!dailyChallenge?.problem?.slug}
          type="button"
          onClick={handleDailyOpen}
        >
          <span>Daily Question</span>
        </button>

        <div className="ml-1 flex items-center gap-1">
          <button
            aria-label="Previous problem"
            className="inline-flex h-[30px] w-[30px] items-center justify-center border border-[color:var(--border)] bg-transparent text-[15px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canGoPrev}
            type="button"
            onClick={() => handleShift(-1)}
          >
            {"<"}
          </button>
          <button
            aria-label="Next problem"
            className="inline-flex h-[30px] w-[30px] items-center justify-center border border-[color:var(--border)] bg-transparent text-[15px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canGoNext}
            type="button"
            onClick={() => handleShift(1)}
          >
            {">"}
          </button>
        </div>

        <div className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
          {problem ? (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="truncate">{currentTitle}</span>
              {currentDifficulty ? (
                <span
                  className={[
                    "inline-flex h-[20px] shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em]",
                    difficultyBadgeClass(problem?.difficulty),
                  ].join(" ")}
                >
                  {currentDifficulty}
                </span>
              ) : null}
            </span>
          ) : (
            "Open a problem to start solving."
          )}
        </div>
      </div>

      <div className="flex h-[38px] shrink-0 items-end gap-1 border-b border-[color:var(--border)] bg-[var(--bg-subtle)] px-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={[
              "inline-flex h-full items-center border-b-2 px-2 text-[12px] transition",
              activeTab === tab.id
                ? "border-[color:var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            ].join(" ")}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "description" ? <ProblemDescription embedded loading={loading} problem={problem} /> : null}
        {activeTab === "submissions" ? (
          <SubmissionPanel rows={submissionRows} status={submissionStatus} username={user?.username || ""} />
        ) : null}
      </div>

      {browserOpen ? (
        <div className="absolute inset-0 z-[var(--z-overlay)] flex min-w-0">
          <button
            aria-label="Close browser"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            type="button"
            onClick={() => setBrowserOpen(false)}
          />

          <div className="relative z-10 flex h-full w-[min(390px,94%)] max-w-full flex-col border-r border-[color:var(--border)] bg-[color:var(--bg-surface)] shadow-[var(--shadow-lg)]">
            <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[color:var(--border)] px-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Workspace Browser</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)]">Problems</div>
              </div>
              <button
                aria-label="Close browser"
                className="inline-flex h-[30px] w-[30px] items-center justify-center border border-[color:var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
                type="button"
                onClick={() => setBrowserOpen(false)}
              >
                x
              </button>
            </div>

            <div className="shrink-0 space-y-3 border-b border-[color:var(--border)] p-4">
              <button
                className="flex h-[44px] w-full items-center gap-3 border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-left transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!dailyChallenge?.problem?.slug}
                type="button"
                onClick={handleDailyOpen}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Daily</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {dailyChallenge?.problem?.title || "Daily challenge unavailable"}
                </span>
                {dailyChallenge?.problem?.difficulty ? (
                  <span
                    className={[
                      "inline-flex h-[20px] shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em]",
                      difficultyBadgeClass(dailyChallenge.problem.difficulty),
                    ].join(" ")}
                  >
                    {String(dailyChallenge.problem.difficulty)}
                  </span>
                ) : null}
              </button>

              <input
                className="h-[var(--h-input)] w-full border border-[color:var(--border)] bg-[var(--bg-input)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Search problems..."
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                {DIFFICULTY_FILTERS.map((item) => {
                  const active = difficulty === item.id;
                  return (
                    <button
                      key={item.id}
                      className={[
                        "inline-flex h-[26px] items-center border px-3 text-[11px] font-medium transition",
                        active
                          ? "border-[color:var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                          : "border-[color:var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]",
                      ].join(" ")}
                      type="button"
                      onClick={() => onDifficultyChange(item.id)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="text-[12px] text-[var(--text-secondary)]">
                Showing <span className="font-semibold text-[var(--text-primary)]">{problems.length}</span> problem{problems.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {problems.length > 0 ? (
                  problems.map((item) => {
                    const itemKey = getProblemKey(item);
                    const active = itemKey === currentProblemKey;

                    return (
                      <button
                        key={itemKey}
                        className={[
                          "w-full border px-3 py-3 text-left transition",
                          active
                            ? "border-[color:var(--accent-border)] bg-[var(--accent-subtle)]"
                            : "border-[color:var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-overlay)]",
                        ].join(" ")}
                        type="button"
                        onClick={() => handleProblemSelect(itemKey)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.title || item.id}</div>
                            <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{item.slug || item.id}</div>
                          </div>
                          <span
                            className={[
                              "inline-flex h-[20px] shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em]",
                              difficultyBadgeClass(item.difficulty),
                            ].join(" ")}
                          >
                            {String(item.difficulty || "easy")}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-[color:var(--border)] p-4 text-[12px] text-[var(--text-secondary)]">
                    No problems match the current filters.
                  </div>
                )}
              </div>
            </div>

            <div className="flex h-[44px] shrink-0 items-center justify-between border-t border-[color:var(--border)] px-4 text-[12px] text-[var(--text-secondary)]">
              <span>Need wider filtering?</span>
              <Link
                className="font-medium text-[var(--text-primary)] transition hover:text-[var(--accent-hover)]"
                to="/problems"
              >
                Open full problems page
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
