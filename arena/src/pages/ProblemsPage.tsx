import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL, arenaApi, userApi } from "../lib/apiClient.js";
import { readStoredToken } from "../lib/storage.js";

const TOPIC_CATEGORIES = [
  "Arrays & Hashing",
  "Two Pointers",
  "Sliding Window",
  "Stack",
  "Binary Search",
  "Linked List",
  "Trees",
  "Tries",
  "Heap / Priority Queue",
  "Backtracking",
  "Graphs",
  "Dynamic Programming",
  "Greedy",
  "Intervals",
  "Math & Geometry",
  "Bit Manipulation",
  "Recursion",
  "Sorting",
];

type Problem = {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  acceptance_rate?: number;
  tags?: string[];
  is_solved?: boolean;
  is_attempted?: boolean;
};

type PaginatedResponse = {
  items: Problem[];
  total: number;
  page: number;
  per_page: number;
  available_tags?: string[];
};

type DailyChallengePayload = {
  id: number;
  date: string;
  is_premium: boolean;
  problem: {
    id: string;
    slug: string;
    title: string;
    difficulty: string;
  };
};

type StreakPayload = {
  streak: number;
  longest_streak: number;
  last_solve_date?: string | null;
  streak_freeze: number;
  timezone: string;
  today_solved: boolean;
};

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const normalized = String(difficulty || "").toLowerCase();
  let styles = "bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
  if (normalized.includes("easy")) styles = "bg-[var(--easy-bg)] text-[var(--easy)]";
  else if (normalized.includes("medium")) styles = "bg-[var(--medium-bg)] text-[var(--medium)]";
  else if (normalized.includes("hard")) styles = "bg-[var(--hard-bg)] text-[var(--hard)]";

  return (
    <span className={["inline-flex h-[var(--h-badge)] items-center rounded-[var(--radius-xs)] px-2 text-[11px] font-semibold uppercase tracking-[0.04em]", styles].join(" ")}>
      {difficulty || "Unknown"}
    </span>
  );
}

function StatusIcon({ solved, attempted }: { solved?: boolean; attempted?: boolean }) {
  if (solved) {
    return (
      <svg aria-hidden="true" className="h-[14px] w-[14px] text-[var(--success)]" fill="none" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1" />
        <path d="M4 7.1 6 9l4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
    );
  }

  if (attempted) {
    return (
      <svg aria-hidden="true" className="h-[14px] w-[14px] text-[var(--warning)]" fill="none" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1" />
        <path d="M7 3.8v3.6l2.2 1.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
      </svg>
    );
  }

  return <span className="inline-block h-[14px] w-[14px]" />;
}

function TagChip({ label, active = false, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  const shared = active
    ? "border-[color:var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--text-primary)]"
    : "border-[color:var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]";

  const className = [
    "inline-flex h-[var(--h-tag)] items-center rounded-[var(--radius-xs)] border px-2 text-[11px] transition",
    shared,
  ].join(" ");

  if (onClick) {
    return (
      <button className={className} type="button" onClick={onClick}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalized = query.trim();
  if (!normalized) return text;

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === normalized.toLowerCase();
        return isMatch ? (
          <mark key={`${part}-${index}`} className="rounded-[var(--radius-xs)] bg-[var(--accent-subtle)] px-0.5 text-[var(--text-primary)]">
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </>
  );
}

function DailyStreakBar({
  dailyChallenge,
  streak,
  onOpenDaily,
}: {
  dailyChallenge: DailyChallengePayload | null;
  streak: StreakPayload | null;
  onOpenDaily: () => void;
}) {
  if (!dailyChallenge && !streak) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-[color:var(--border)] px-4 py-2 xl:flex-row">
      {dailyChallenge ? (
        <button
          className="flex h-[var(--h-daily-bar)] min-w-0 flex-1 items-center gap-3 border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 text-left transition hover:bg-[var(--bg-overlay)]"
          type="button"
          onClick={onOpenDaily}
        >
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Daily</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">{dailyChallenge.problem.title}</span>
          <DifficultyBadge difficulty={dailyChallenge.problem.difficulty} />
          <span className="shrink-0 text-[11px] font-semibold text-[var(--text-secondary)]">Solve</span>
        </button>
      ) : null}

      {streak ? (
        <div className="flex h-[var(--h-daily-bar)] min-w-[220px] items-center gap-3 border border-[color:var(--border)] bg-[var(--bg-surface)] px-4">
          <span className="text-[18px] leading-none">{streak.streak > 0 ? "🔥" : "○"}</span>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-[var(--text-primary)]">
              {streak.streak} day{streak.streak === 1 ? "" : "s"}
            </div>
            <div className="truncate text-[11px] text-[var(--text-secondary)]">
              Best: {streak.longest_streak} · Freeze: {streak.streak_freeze} · {streak.today_solved ? "Solved today" : "Solve today"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ProblemsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengePayload | null>(null);
  const [streak, setStreak] = useState<StreakPayload | null>(null);

  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(searchParams.get("per_page") || "50", 10);
  const searchQuery = searchParams.get("search") || "";
  const difficultyFilter = searchParams.get("difficulty") || "";
  const statusFilter = searchParams.get("status") || "";
  const selectedTags = useMemo(() => {
    const raw = searchParams.get("tags");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const [searchInput, setSearchInput] = useState(searchQuery);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const nextParams = new URLSearchParams(searchParams);
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
      if (key === "page") {
        if (!value) nextParams.set("page", "1");
      } else {
        nextParams.set("page", "1");
      }
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams]
  );

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("per_page", String(perPage));
      if (searchQuery) params.set("q", searchQuery);
      if (difficultyFilter) params.set("difficulty", difficultyFilter);
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));

      const token = readStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/api/problems?${params.toString()}`, { headers });
      const data: PaginatedResponse = await response.json();
      setProblems(data.items || []);
      setTotal(data.total || 0);
      setAvailableTags(data.available_tags || []);
    } catch (error) {
      console.error("Failed to fetch problems:", error);
      setProblems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, difficultyFilter, perPage, searchQuery, selectedTags]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const token = readStoredToken();

    async function loadEngagement() {
      const [challenge, streakPayload] = await Promise.all([
        arenaApi.getDailyChallenge().catch(() => null),
        token ? userApi.getMyStreak().catch(() => null) : Promise.resolve(null),
      ]);

      if (!cancelled) {
        setDailyChallenge(challenge);
        setStreak(streakPayload);
      }
    }

    loadEngagement().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTag = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag];
    updateFilter("tags", nextTags.join(","));
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateFilter("search", searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams({});
  };

  const filteredProblems = useMemo(() => {
    if (!statusFilter) return problems;

    return problems.filter((problem) => {
      if (statusFilter === "solved") return problem.is_solved;
      if (statusFilter === "attempted") return problem.is_attempted && !problem.is_solved;
      if (statusFilter === "unsolved") return !problem.is_solved && !problem.is_attempted;
      return true;
    });
  }, [problems, statusFilter]);

  const totalPages = Math.ceil(total / perPage);
  const hasActiveFilters = Boolean(searchQuery || difficultyFilter || statusFilter || selectedTags.length > 0);
  const displayTags = availableTags.length > 0 ? availableTags : TOPIC_CATEGORIES;

  return (
    <div className="flex h-[calc(100vh-var(--h-navbar))] flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/92 px-3 py-3 backdrop-blur lg:h-full lg:w-[272px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="space-y-3">
          <form onSubmit={handleSearchSubmit}>
            <input
              className="h-[var(--h-input)] w-full rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-input)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Search problems..."
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </form>

          <div className="flex flex-wrap gap-2">
            {["", "Easy", "Medium", "Hard"].map((difficulty) => (
              <TagChip
                key={difficulty || "all"}
                active={difficultyFilter === difficulty}
                label={difficulty || "All"}
                onClick={() => updateFilter("difficulty", difficulty)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "All" },
              { value: "solved", label: "Solved" },
              { value: "attempted", label: "Attempted" },
              { value: "unsolved", label: "Todo" },
            ].map((option) => (
              <TagChip
                key={option.value || "all"}
                active={statusFilter === option.value}
                label={option.label}
                onClick={() => updateFilter("status", option.value)}
              />
            ))}
          </div>

          <div className="flex max-h-[180px] flex-wrap gap-2 overflow-y-auto lg:max-h-none">
            {displayTags.map((tag) => (
              <TagChip key={tag} active={selectedTags.includes(tag)} label={tag} onClick={() => toggleTag(tag)} />
            ))}
          </div>

          {hasActiveFilters ? (
            <button
              className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DailyStreakBar
          dailyChallenge={dailyChallenge}
          streak={streak}
          onOpenDaily={() => navigate(`/problems/${dailyChallenge?.problem.slug}`)}
        />

        <div className="flex h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/88 px-4">
          <div className="min-w-0 truncate text-[12px] text-[var(--text-secondary)]">
            Showing <span className="font-semibold text-[var(--text-primary)]">{filteredProblems.length}</span> of{" "}
            <span className="font-semibold text-[var(--text-primary)]">{total}</span> problems
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <label htmlFor="perPage">Per page</label>
            <select
              id="perPage"
              className="h-[var(--h-input)] rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-input)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
              value={perPage}
              onChange={(event) => updateFilter("per_page", event.target.value)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col />
              <col style={{ width: "96px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "180px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--bg-base)]">
              <tr className="h-[var(--h-table-head)] border-b border-[color:var(--border)]">
                {["", "Title", "Difficulty", "Acceptance", "Tags"].map((header, index) => (
                  <th
                    key={header || index}
                    className={[
                      "px-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]",
                      index === 0 ? "pl-4" : "",
                    ].join(" ")}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]" colSpan={5}>
                    Loading problems...
                  </td>
                </tr>
              ) : filteredProblems.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]" colSpan={5}>
                    {searchQuery ? `No results for "${searchQuery}".` : "No problems found."}
                  </td>
                </tr>
              ) : (
                filteredProblems.map((problem) => (
                  <tr
                    key={problem.id || problem.slug}
                    className="h-[var(--h-table-row)] cursor-pointer border-b border-[color:var(--border)] transition hover:bg-[var(--bg-overlay)]"
                    onClick={() => navigate(`/problems/${problem.slug}`)}
                  >
                    <td className="pl-4 text-center">
                      <StatusIcon attempted={problem.is_attempted} solved={problem.is_solved} />
                    </td>
                    <td className="pr-3">
                      <div className="truncate text-[13px] text-[var(--text-primary)]">
                        <HighlightedText query={searchQuery} text={problem.title} />
                      </div>
                    </td>
                    <td className="pr-3">
                      <DifficultyBadge difficulty={problem.difficulty} />
                    </td>
                    <td
                      className={[
                        "pr-3 text-[12px] tabular-nums",
                        (problem.acceptance_rate || 0) >= 50
                          ? "text-[var(--success)]"
                          : (problem.acceptance_rate || 0) >= 30
                            ? "text-[var(--warning)]"
                            : "text-[var(--text-secondary)]",
                      ].join(" ")}
                    >
                      {problem.acceptance_rate != null ? `${Math.round(problem.acceptance_rate)}%` : "--"}
                    </td>
                    <td className="pr-4">
                      <div className="flex items-center gap-1 overflow-hidden">
                        {(problem.tags || []).slice(0, 2).map((tag) => (
                          <TagChip key={tag} label={tag} />
                        ))}
                        {(problem.tags || []).length > 2 ? (
                          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">+{(problem.tags || []).length - 2}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex h-[44px] shrink-0 items-center justify-between border-t border-[color:var(--border)] px-4 text-[12px] text-[var(--text-secondary)]">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-[var(--h-btn-sm)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] px-3 transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => updateFilter("page", String(Math.max(1, currentPage - 1)))}
              >
                Previous
              </button>
              <button
                className="inline-flex h-[var(--h-btn-sm)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] px-3 transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                type="button"
                onClick={() => updateFilter("page", String(Math.min(totalPages, currentPage + 1)))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
