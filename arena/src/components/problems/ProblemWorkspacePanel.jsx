import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatMemory, formatRuntime, localizeVerdictLabel } from "../../lib/formatters.js";
import { formatProblemTitle, localizeDifficultyLabel } from "../../lib/problemPresentation.js";
import { getMySubmissions, hydrateSubmissionRows, resolveSubmissionOutcome } from "../../services/profileService";
import ProblemDescription from "../problem/ProblemDescription.tsx";

const DIFFICULTY_FILTERS = [
  { id: "all", label: "Barchasi" },
  { id: "easy", label: "Oson" },
  { id: "medium", label: "O'rtacha" },
  { id: "hard", label: "Qiyin" },
];

const TABS = [
  { id: "description", label: "Tavsif" },
  { id: "submissions", label: "Yuborishlar" },
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
  const acceptedCount = rows.filter((row) => resolveSubmissionOutcome(row).includes("accepted")).length;
  const fastestAccepted = rows
    .filter((row) => resolveSubmissionOutcome(row).includes("accepted") && row.runtime_ms != null)
    .sort((left, right) => Number(left.runtime_ms || 0) - Number(right.runtime_ms || 0))[0];

  if (!username) {
    return (
      <EmptyStateCard
        eyebrow="Yuborishlar"
        title="Haqiqiy yuborish tarixini ko'rish uchun tizimga kiring"
        copy="Bu bo'lim aynan shu masala bo'yicha sizning vaqt, xotira va natija tarixingizni ko'rsatadi. Tizimga kirganingizdan keyin bu yer avtomatik to'ladi."
        action={
          <Link
            className="inline-flex h-[var(--h-btn-md)] items-center border border-[color:var(--border)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
            to="/login"
          >
            Kirish oynasi
          </Link>
        }
      />
    );
  }

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-secondary)]">
        Masala yuborishlari yuklanmoqda...
      </div>
    );
  }

  if (status === "error") {
    return (
      <EmptyStateCard
        eyebrow="Yuborishlar"
        title="Masala yuborishlarini yuklab bo'lmadi"
        copy="Yuborish tarixi hozircha olinmadi. API ni qayta tekshirib ko'ring yoki sahifani yangilang."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyStateCard
        eyebrow="Yuborishlar"
        title="Bu masala uchun hali yuborish yo'q"
        copy="Bu masala uchun hali yuborish qilinmagan. Sinash yoki Yuborish tugmasidan foydalangach, tarix shu yerda ko'rinadi."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 gap-3 border-b border-[color:var(--border)] p-4 md:grid-cols-3">
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Jami yuborishlar</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--text-primary)]">{rows.length}</div>
        </div>
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Qabul qilingan</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--success)]">{acceptedCount}</div>
        </div>
        <div className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Eng tez qabul</div>
          <div className="mt-2 text-[20px] font-semibold text-[var(--text-primary)]">
            {fastestAccepted ? formatRuntime(fastestAccepted.runtime_ms) : "--"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {rows.map((submission, index) => {
            const verdict = String(submission.verdict || submission.status || "pending");
            return (
              <div
                key={`${submission.submission_id || submission.created_at || submission.problem_id}-${index}`}
                className="border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">{submission.problem_title || submission.problem_id}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>{submission.language || "noma'lum"}</span>
                      <span>{submission.created_at ? new Date(submission.created_at).toLocaleString() : "--"}</span>
                    </div>
                  </div>
                  <span className={["inline-flex h-[22px] items-center px-2 text-[11px] font-semibold uppercase tracking-[0.05em]", statusTone(verdict)].join(" ")}>
                    {localizeVerdictLabel(verdict)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-[12px] text-[var(--text-secondary)] sm:grid-cols-3">
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Vaqt: <span className="font-medium text-[var(--text-primary)]">{formatRuntime(submission.runtime_ms)}</span>
                  </div>
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Xotira: <span className="font-medium text-[var(--text-primary)]">{formatMemory(submission.memory_kb)}</span>
                  </div>
                  <div className="border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                    Qiyinlik: <span className="font-medium text-[var(--text-primary)]">{localizeDifficultyLabel(submission.difficulty)}</span>
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
  const currentTitle = formatProblemTitle(problem);
  const currentDifficulty = localizeDifficultyLabel(problem?.difficulty);
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
          <span>Masalalar</span>
          <span>ro'yxati</span>
        </button>

        <button
          className="inline-flex h-[30px] items-center gap-2 border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!dailyChallenge?.problem?.slug}
          type="button"
          onClick={handleDailyOpen}
        >
          <span>Kunlik masala</span>
        </button>

        <div className="ml-1 flex items-center gap-1">
          <button
            aria-label="Oldingi masala"
            className="inline-flex h-[30px] w-[30px] items-center justify-center border border-[color:var(--border)] bg-transparent text-[15px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canGoPrev}
            type="button"
            onClick={() => handleShift(-1)}
          >
            {"<"}
          </button>
          <button
            aria-label="Keyingi masala"
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
            "Yechishni boshlash uchun masalani oching."
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Ish maydoni</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)]">Masalalar</div>
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
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Kunlik</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {dailyChallenge?.problem ? formatProblemTitle(dailyChallenge.problem) : "Kunlik masala hozircha yo'q"}
                </span>
                {dailyChallenge?.problem?.difficulty ? (
                  <span
                    className={[
                      "inline-flex h-[20px] shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em]",
                      difficultyBadgeClass(dailyChallenge.problem.difficulty),
                    ].join(" ")}
                  >
                    {localizeDifficultyLabel(dailyChallenge.problem.difficulty)}
                  </span>
                ) : null}
              </button>

              <input
                className="h-[var(--h-input)] w-full border border-[color:var(--border)] bg-[var(--bg-input)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Masalalarni qidiring..."
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
                <span className="font-semibold text-[var(--text-primary)]">{problems.length}</span> ta masala
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
                            <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{formatProblemTitle(item)}</div>
                            <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{item.slug || item.id}</div>
                          </div>
                          <span
                            className={[
                              "inline-flex h-[20px] shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-[0.06em]",
                              difficultyBadgeClass(item.difficulty),
                            ].join(" ")}
                          >
                            {localizeDifficultyLabel(item.difficulty)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-[color:var(--border)] p-4 text-[12px] text-[var(--text-secondary)]">
                    Joriy filtrlarga mos masala topilmadi.
                  </div>
                )}
              </div>
            </div>

            <div className="flex h-[44px] shrink-0 items-center justify-between border-t border-[color:var(--border)] px-4 text-[12px] text-[var(--text-secondary)]">
              <span>Kengroq qidiruv kerakmi?</span>
              <Link
                className="font-medium text-[var(--text-primary)] transition hover:text-[var(--accent-hover)]"
                to="/problems"
              >
                To'liq masalalar sahifasi
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
