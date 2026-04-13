import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi } from "../../lib/adminApiClient.js";

// ---------------------------------------------------------------------------
// Module-level cache — sahifalar orasida saqlanadi, reload bo'lmaydi
// ---------------------------------------------------------------------------
const _cache = {
  problems: null,
  stats: null,
  timestamp: 0,
  params: "",
};
const CACHE_TTL = 3 * 60 * 1000; // 3 daqiqa

function getCached(params) {
  if (
    _cache.problems &&
    _cache.params === params &&
    Date.now() - _cache.timestamp < CACHE_TTL
  ) {
    return { problems: _cache.problems, stats: _cache.stats };
  }
  return null;
}

function setCache(params, problems, stats) {
  _cache.problems = problems;
  _cache.stats = stats;
  _cache.params = params;
  _cache.timestamp = Date.now();
}

function invalidateCache() {
  _cache.problems = null;
  _cache.timestamp = 0;
}

// ---------------------------------------------------------------------------
const DIFFICULTY_COLORS = {
  easy: "text-green-400 bg-green-400/10 border border-green-400/20",
  medium: "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20",
  hard: "text-red-400 bg-red-400/10 border border-red-400/20",
};
const DIFFICULTY_LABELS = { easy: "Oson", medium: "O'rta", hard: "Qiyin" };

export default function AdminProblemsListPage() {
  const navigate = useNavigate();
  const [problems, setProblems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterDiff, setFilterDiff] = useState("");

  // Inline delete state: { [problemId]: "confirming" | "deleting" | "removing" }
  const [deleteState, setDeleteState] = useState({});

  // Search debounce
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------
  const loadData = useCallback(
    async (force = false) => {
      const cacheKey = `${debouncedSearch}|${filterDiff}`;
      if (!force) {
        const cached = getCached(cacheKey);
        if (cached) {
          setProblems(cached.problems);
          setStats(cached.stats);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError("");
      try {
        const [problemsData, statsData] = await Promise.all([
          adminApi.getProblems({ q: debouncedSearch, difficulty: filterDiff }),
          adminApi.getStats(),
        ]);
        const p = problemsData || [];
        setProblems(p);
        setStats(statsData);
        setCache(cacheKey, p, statsData);
      } catch (err) {
        setError(err.message || "Ma'lumotlar yuklanmadi");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, filterDiff]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Delete — 2 bosqich: confirm → delete
  // ---------------------------------------------------------------------------
  function askConfirm(problemId) {
    setDeleteState((prev) => ({ ...prev, [problemId]: "confirming" }));
  }

  function cancelConfirm(problemId) {
    setDeleteState((prev) => {
      const next = { ...prev };
      delete next[problemId];
      return next;
    });
  }

  async function confirmDelete(problemId) {
    setDeleteState((prev) => ({ ...prev, [problemId]: "deleting" }));
    try {
      await adminApi.deleteProblem(problemId);
      // Avval "removing" holati — CSS animatsiya ishga tushadi
      setDeleteState((prev) => ({ ...prev, [problemId]: "removing" }));
      // 350ms animatsiya tugagandan keyin listdan olib tashlaymiz
      setTimeout(() => {
        setProblems((prev) => prev.filter((p) => p.id !== problemId));
        setDeleteState((prev) => {
          const next = { ...prev };
          delete next[problemId];
          return next;
        });
        invalidateCache();
        setStats((prev) =>
          prev
            ? { ...prev, total_problems: Math.max(0, prev.total_problems - 1) }
            : prev
        );
      }, 350);
    } catch (err) {
      setError("O'chirishda xato: " + (err.message || "Noma'lum xato"));
      setDeleteState((prev) => {
        const next = { ...prev };
        delete next[problemId];
        return next;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙</span>
            <div>
              <h1 className="text-xl font-bold text-white">Admin Panel</h1>
              <p className="text-sm text-gray-400">Masalalar boshqaruvi</p>
            </div>
          </div>
          <Link
            to="/admin/problems/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <span>+</span> Yangi masala
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Jami", value: stats.total_problems, color: "blue" },
              { label: "Oson", value: stats.easy_count, color: "green" },
              { label: "O'rta", value: stats.medium_count, color: "yellow" },
              { label: "Qiyin", value: stats.hard_count, color: "red" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center"
              >
                <div className={`text-3xl font-bold text-${s.color}-400`}>
                  {s.value}
                </div>
                <div className="text-sm text-gray-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Masala nomini qidiring..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <select
            value={filterDiff}
            onChange={(e) => setFilterDiff(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Barcha qiyinliklar</option>
            <option value="easy">Oson</option>
            <option value="medium">O'rta</option>
            <option value="hard">Qiyin</option>
          </select>
          <button
            onClick={() => loadData(true)}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2.5 rounded-lg transition-colors"
          >
            Yangilash
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
            </div>
          ) : problems.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-4xl mb-3">📭</div>
              <p>Masalalar topilmadi</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase text-xs">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Masala</th>
                  <th className="text-center px-4 py-3 font-medium">Qiyinlik</th>
                  <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">
                    Test
                  </th>
                  <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">
                    LeetCode
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {problems.map((problem, idx) => {
                  const ds = deleteState[problem.id];
                  const isConfirming = ds === "confirming";
                  const isDeleting = ds === "deleting";
                  const isRemoving = ds === "removing";

                  return (
                    <tr
                      key={problem.id}
                      style={{
                        transition: "opacity 0.35s ease, transform 0.35s ease",
                        opacity: isRemoving ? 0 : 1,
                        transform: isRemoving ? "translateX(40px)" : "translateX(0)",
                        pointerEvents: isRemoving ? "none" : undefined,
                      }}
                      className={`${
                        isConfirming ? "bg-red-950/20" : "hover:bg-gray-800/50"
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-100 max-w-xs truncate">
                          {problem.title}
                        </div>
                        {problem.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {problem.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                            DIFFICULTY_COLORS[problem.difficulty] ||
                            "text-gray-400"
                          }`}
                        >
                          {DIFFICULTY_LABELS[problem.difficulty] ||
                            problem.difficulty}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center hidden sm:table-cell text-gray-400">
                        {problem.test_case_count}
                      </td>

                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        {problem.leetcode_id ? (
                          <a
                            href={`https://leetcode.com/problems/${problem.slug}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs"
                          >
                            #{problem.leetcode_id}
                          </a>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Amallar — inline confirm */}
                      <td className="px-4 py-3">
                        {isConfirming ? (
                          // Tasdiqlash holati — o'sha qatorda
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-red-300 hidden sm:inline">
                              O'chirilsinmi?
                            </span>
                            <button
                              onClick={() => confirmDelete(problem.id)}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                            >
                              Ha, o'chir
                            </button>
                            <button
                              onClick={() => cancelConfirm(problem.id)}
                              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Yo'q
                            </button>
                          </div>
                        ) : isDeleting ? (
                          <div className="flex justify-end pr-2">
                            <span className="animate-spin text-red-400">⟳</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`/problems/${problem.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-400 transition-colors p-1.5 rounded hover:bg-blue-400/10"
                              title="Ko'rish"
                            >
                              👁
                            </a>
                            <button
                              onClick={() =>
                                navigate(
                                  `/admin/problems/${problem.id}/edit`
                                )
                              }
                              className="text-gray-400 hover:text-yellow-400 transition-colors p-1.5 rounded hover:bg-yellow-400/10"
                              title="Tahrirlash"
                            >
                              ✏
                            </button>
                            <button
                              onClick={() => askConfirm(problem.id)}
                              className="text-gray-400 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-400/10"
                              title="O'chirish"
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-center text-gray-600 text-sm">
          Jami {problems.length} ta masala
        </div>
      </div>
    </div>
  );
}
