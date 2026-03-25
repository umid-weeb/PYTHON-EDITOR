import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardShell from "../components/layout/DashboardShell.jsx";
import useDebouncedValue from "../hooks/useDebouncedValue.js";
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
  const normalized = difficulty?.toLowerCase() || "";
  let colorClass = "bg-slate-500/20 text-slate-400";
  if (normalized.includes("easy")) colorClass = "bg-emerald-500/20 text-emerald-400";
  else if (normalized.includes("medium")) colorClass = "bg-amber-500/20 text-amber-400";
  else if (normalized.includes("hard")) colorClass = "bg-rose-500/20 text-rose-400";

  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>{difficulty || "Unknown"}</span>;
}

function StatusIcon({ solved, attempted }: { solved?: boolean; attempted?: boolean }) {
  if (solved) {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
        <svg className="h-3 w-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }

  if (attempted) {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20">
        <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }

  return <div className="h-5 w-5" />;
}

function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
        active
          ? "border-arena-primary/40 bg-arena-primary/20 text-arena-primaryStrong"
          : "border-white/10 bg-white/5 text-arena-muted hover:bg-white/10 hover:text-arena-text"
      }`}
    >
      {tag}
    </button>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalized = query.trim();
  if (!normalized) {
    return text;
  }

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === normalized.toLowerCase();
        return isMatch ? (
          <mark key={`${part}-${index}`} className="rounded bg-indigo-400/20 px-0.5 text-indigo-100">
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </>
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
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const updateFilter = useCallback((key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    nextParams.set("page", "1");
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);

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
    if (debouncedSearch === searchQuery) {
      return;
    }
    updateFilter("search", debouncedSearch.trim());
  }, [debouncedSearch, searchQuery, updateFilter]);

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
    if (!statusFilter) {
      return problems;
    }

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
    <DashboardShell eyebrow="Practice" title="Problems" subtitle="Master algorithms and data structures, one problem at a time.">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-arena-text">Search</h3>
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search problems..."
                    className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-4 py-2.5 text-sm text-arena-text placeholder-arena-muted focus:border-arena-primary/50 focus:outline-none"
                  />
                  <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-arena-muted hover:text-arena-text">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-arena-text">Difficulty</h3>
              <div className="flex flex-wrap gap-2">
                {["", "Easy", "Medium", "Hard"].map((difficulty) => (
                  <button
                    key={difficulty || "all"}
                    type="button"
                    onClick={() => updateFilter("difficulty", difficulty)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      difficultyFilter === difficulty
                        ? "border-arena-primary/40 bg-arena-primary/20 text-arena-primaryStrong"
                        : "border-white/10 bg-white/5 text-arena-muted hover:bg-white/10"
                    }`}
                  >
                    {difficulty || "All"}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-arena-text">Status</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "", label: "All" },
                  { value: "solved", label: "Solved" },
                  { value: "attempted", label: "Attempted" },
                  { value: "unsolved", label: "Todo" },
                ].map((option) => (
                  <button
                    key={option.value || "all"}
                    type="button"
                    onClick={() => updateFilter("status", option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      statusFilter === option.value
                        ? "border-arena-primary/40 bg-arena-primary/20 text-arena-primaryStrong"
                        : "border-white/10 bg-white/5 text-arena-muted hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-arena-text">Topics</h3>
              <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                {displayTags.map((tag) => (
                  <TagChip key={tag} tag={tag} active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} />
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-arena-muted hover:bg-white/10 hover:text-arena-text"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {dailyChallenge || streak ? (
            <div className="mb-4 grid gap-4 xl:grid-cols-2">
              {dailyChallenge ? (
                <button
                  type="button"
                  onClick={() => navigate(`/problems/${dailyChallenge.problem.slug}`)}
                  className="group rounded-xl border border-indigo-400/20 bg-gradient-to-r from-indigo-500/10 via-slate-900/80 to-emerald-500/10 p-4 text-left transition hover:border-indigo-300/40 hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Daily Challenge</div>
                      <div className="mt-1 text-lg font-semibold text-arena-text group-hover:text-white">{dailyChallenge.problem.title}</div>
                      <div className="mt-1 text-sm text-arena-muted">{dailyChallenge.date} | {dailyChallenge.problem.difficulty}</div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-arena-text">
                      Solve now
                    </span>
                  </div>
                </button>
              ) : null}

              {streak ? (
                <div className="rounded-xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-slate-900/80 to-rose-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Current Streak</div>
                      <div className="mt-1 text-lg font-semibold text-arena-text">
                        {streak.streak} day{streak.streak === 1 ? "" : "s"}
                      </div>
                      <div className="mt-1 text-sm text-arena-muted">
                        Best {streak.longest_streak} | Freeze {streak.streak_freeze} | {streak.today_solved ? "Solved today" : "Keep it alive today"}
                      </div>
                    </div>
                    <div className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                      {streak.timezone}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-arena-muted">
                Showing <span className="font-medium text-arena-text">{filteredProblems.length}</span> of <span className="font-medium text-arena-text">{total}</span> problems
              </span>
              {selectedTags.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-arena-muted">Tags:</span>
                  {selectedTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-arena-primary/20 px-2 py-0.5 text-xs text-arena-primaryStrong">
                      {tag}
                      <button type="button" onClick={() => toggleTag(tag)} className="ml-0.5 hover:text-white">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="perPage" className="text-xs text-arena-muted">Per page:</label>
              <select
                id="perPage"
                value={perPage}
                onChange={(event) => updateFilter("per_page", event.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b1220] px-2 py-1 text-sm text-arena-text focus:outline-none"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-[#0b1220]/50">
                    <th className="w-12 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-arena-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-arena-muted">Title</th>
                    <th className="w-24 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-arena-muted">Difficulty</th>
                    <th className="hidden w-28 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-arena-muted sm:table-cell">Acceptance</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-arena-muted md:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-arena-muted">
                        <div className="flex items-center justify-center gap-2">
                          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Loading problems...
                        </div>
                      </td>
                    </tr>
                  ) : filteredProblems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-arena-muted">
                        <div className="mx-auto max-w-md space-y-2">
                          <div className="text-3xl">/</div>
                          <div className="text-base font-medium text-arena-text">No problems found</div>
                          <div>
                            {searchQuery
                              ? `No results for "${searchQuery}". Try different keywords or clear filters.`
                              : "Try adjusting your filters or explore a different topic."}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProblems.map((problem) => (
                      <tr
                        key={problem.id || problem.slug}
                        className="group cursor-pointer transition-colors hover:bg-white/5"
                        onClick={() => navigate(`/problems/${problem.slug}`)}
                      >
                        <td className="px-4 py-3">
                          <StatusIcon solved={problem.is_solved} attempted={problem.is_attempted} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-arena-text group-hover:text-arena-primaryStrong">
                            <HighlightedText text={problem.title} query={searchQuery} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <DifficultyBadge difficulty={problem.difficulty} />
                        </td>
                        <td className="hidden px-4 py-3 text-sm text-arena-muted sm:table-cell">
                          {problem.acceptance_rate != null ? `${Math.round(problem.acceptance_rate)}%` : "--"}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(problem.tags || []).slice(0, 3).map((tag) => (
                              <span key={tag} className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-arena-muted">
                                <HighlightedText text={tag} query={searchQuery} />
                              </span>
                            ))}
                            {(problem.tags || []).length > 3 ? (
                              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-arena-muted">
                                +{(problem.tags || []).length - 3}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-arena-muted">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter("page", String(Math.max(1, currentPage - 1)))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-arena-muted transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                    let pageNumber: number;
                    if (totalPages <= 5) {
                      pageNumber = index + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = index + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + index;
                    } else {
                      pageNumber = currentPage - 2 + index;
                    }

                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => updateFilter("page", String(pageNumber))}
                        className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                          pageNumber === currentPage
                            ? "bg-arena-primary/20 text-arena-primaryStrong"
                            : "text-arena-muted hover:bg-white/10"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => updateFilter("page", String(Math.min(totalPages, currentPage + 1)))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-arena-muted transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </DashboardShell>
  );
}
