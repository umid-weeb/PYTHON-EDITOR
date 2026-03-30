import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL, arenaApi, userApi } from "../lib/apiClient.js";
import { formatProblemTitle, localizeDifficultyLabel, localizeTagLabel } from "../lib/problemPresentation.js";
import { readStoredToken } from "../lib/storage.js";
import { useAuth } from "../context/AuthContext.jsx";

type Problem = {
  id: string;
  slug: string;
  title: string;
  order_index?: number;
  difficulty: string;
  acceptance_rate?: number;
  solvers_count?: number;
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
    order_index?: number;
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
      {localizeDifficultyLabel(difficulty)}
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

function StatusPill({ solved, attempted }: { solved?: boolean; attempted?: boolean }) {
  if (!solved && !attempted) return null;

  const label = solved ? "Yechilgan" : "Ishlangan";
  const tone = solved
    ? "border-[color:var(--success)]/30 bg-[var(--success-bg)] text-[var(--success)]"
    : "border-[color:var(--warning)]/30 bg-[var(--warning-bg)] text-[var(--warning)]";

  return (
    <span className={["inline-flex h-[20px] items-center rounded-[var(--radius-xs)] border px-2 text-[10px] font-semibold uppercase tracking-[0.05em]", tone].join(" ")}>
      {label}
    </span>
  );
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
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Kunlik</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">{formatProblemTitle(dailyChallenge.problem)}</span>
          <DifficultyBadge difficulty={dailyChallenge.problem.difficulty} />
          <span className="shrink-0 text-[11px] font-semibold text-[var(--text-secondary)]">Yechish</span>
        </button>
      ) : null}

      {streak ? (
        <div className="flex h-[var(--h-daily-bar)] min-w-[220px] items-center gap-3 border border-[color:var(--border)] bg-[var(--bg-surface)] px-4">
          <span className="text-[18px] leading-none">{streak.streak > 0 ? "🔥" : "○"}</span>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-[var(--text-primary)]">
              {streak.streak} kun
            </div>
            <div className="truncate text-[11px] text-[var(--text-secondary)]">
              Eng uzuni: {streak.longest_streak} · Muzlatish: {streak.streak_freeze} · {streak.today_solved ? "Bugun yechildi" : "Bugun yeching"}
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
  const { token, user } = useAuth();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
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

    async function loadEngagement() {
      const tokenToUse = token || readStoredToken();
      const [challenge, streakPayload] = await Promise.all([
        arenaApi.getDailyChallenge().catch(() => null),
        tokenToUse ? userApi.getMyStreak(tokenToUse).catch(() => null) : Promise.resolve(null),
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
  }, [token, user]);

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
  
  return (
    <div className="flex h-[calc(100vh-var(--h-navbar))] flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/92 px-4 py-4 backdrop-blur lg:h-full lg:w-[300px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="space-y-6">
          {/* Search Section */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Qidiruv</h3>
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <input
                  className="h-[var(--h-input)] w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[var(--bg-input)] pl-9 pr-3 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20"
                  placeholder="Masalani qidiring..."
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </form>
          </div>

          {/* Difficulty & Status Section */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Qiyinlik</h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "", label: "Barchasi" },
                  { value: "easy", label: "Oson" },
                  { value: "medium", label: "O'rtacha" },
                  { value: "hard", label: "Qiyin" },
                ].map((difficulty) => (
                  <TagChip
                    key={difficulty.value || "all"}
                    active={difficultyFilter === difficulty.value}
                    label={difficulty.label}
                    onClick={() => updateFilter("difficulty", difficulty.value)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Holat</h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "", label: "Barchasi" },
                  { value: "solved", label: "Yechilgan" },
                  { value: "attempted", label: "Urinilgan" },
                  { value: "unsolved", label: "Yangi" },
                ].map((option) => (
                  <TagChip
                    key={option.value || "all"}
                    active={statusFilter === option.value}
                    label={option.label}
                    onClick={() => updateFilter("status", option.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Categorized Tags */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Mavzular</h3>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => updateFilter("tags", "")}
                  className="text-[10px] text-[var(--accent)] hover:underline"
                >
                  Tozalash
                </button>
              )}
            </div>
            
            <div className="space-y-5">
              {[
                { label: "Asosiy", tags: ["array", "hashmap", "sorting", "math", "bit-manipulation"] },
                { label: "Algoritmlar", tags: ["two-pointers", "sliding-window", "binary-search", "recursion", "backtracking", "greedy"] },
                { label: "Ma'lumot Tuzilmalari", tags: ["stack", "linked-list", "Trees", "Graphs", "heap / priority queue"] },
                { label: "Murakkab", tags: ["dynamic-programming", "Tries", "Intervals"] }
              ].map((category) => (
                <div key={category.label} className="space-y-2">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)]">{category.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {category.tags.map((tag) => (
                      <TagChip key={tag} active={selectedTags.includes(tag)} label={localizeTagLabel(tag)} onClick={() => toggleTag(tag)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasActiveFilters ? (
            <button
              className="flex h-[var(--h-btn-md)] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[var(--bg-surface)] text-[12px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={clearFilters}
            >
              Hammasini tozalash
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
            <span className="font-semibold text-[var(--text-primary)]">{filteredProblems.length}</span> /{" "}
            <span className="font-semibold text-[var(--text-primary)]">{total}</span> ta masala ko'rsatilmoqda
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <label htmlFor="perPage">Sahifada</label>
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
                {["", "Masala", "Qiyinlik", "Yechilgan", "Teglar"].map((header, index) => (
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
                    Masalalar yuklanmoqda...
                  </td>
                </tr>
              ) : filteredProblems.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[12px] text-[var(--text-secondary)]" colSpan={5}>
                    {searchQuery ? `"${searchQuery}" bo'yicha natija topilmadi.` : "Masalalar topilmadi."}
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
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 truncate text-[13px] text-[var(--text-primary)]">
                          <HighlightedText query={searchQuery} text={formatProblemTitle(problem)} />
                        </div>
                        <StatusPill attempted={problem.is_attempted} solved={problem.is_solved} />
                      </div>
                    </td>
                    <td className="pr-3">
                      <DifficultyBadge difficulty={problem.difficulty} />
                    </td>
                    <td
                      className={[
                        "pr-3 text-[12px] tabular-nums",
                        (problem.solvers_count || 0) > 10
                          ? "text-[var(--success)]"
                          : (problem.solvers_count || 0) > 0
                            ? "text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)]",
                      ].join(" ")}
                    >
                      {problem.solvers_count != null ? (
                        <div className="flex items-center gap-1.5">
                          <svg className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                            <circle cx="8.5" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                          </svg>
                          <span>{problem.solvers_count}</span>
                        </div>
                      ) : "--"}
                    </td>
                    <td className="pr-4">
                      <div className="flex items-center gap-1 overflow-hidden">
                        {(problem.tags || []).slice(0, 2).map((tag) => (
                          <TagChip key={tag} label={localizeTagLabel(tag)} />
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
              {currentPage}-sahifa / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-[var(--h-btn-sm)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] px-3 transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => updateFilter("page", String(Math.max(1, currentPage - 1)))}
              >
                Oldingi
              </button>
              <button
                className="inline-flex h-[var(--h-btn-sm)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] px-3 transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                type="button"
                onClick={() => updateFilter("page", String(Math.min(totalPages, currentPage + 1)))}
              >
                Keyingi
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
