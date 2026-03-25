import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { userApi } from "../../lib/apiClient.js";

interface SearchResult {
  username: string;
  avatar_url?: string;
  rating?: number;
}

function UserSearchDropdown() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchUsers = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const users = await userApi.searchUsers(searchQuery);
      setResults(users.slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchUsers]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search users..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="h-9 w-48 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-white/20 focus:bg-white/8 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {isOpen && (query.trim() || results.length > 0) && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#1a1f2e] shadow-2xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((user) => (
                <button
                  key={user.username}
                  onClick={() => {
                    navigate(`/profile/${encodeURIComponent(user.username)}`);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      user.username.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{user.username}</div>
                    {user.rating && (
                      <div className="text-xs text-gray-400">Rating: {user.rating}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="px-4 py-4 text-center text-sm text-gray-400">
              No users found
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const username = user?.username || "";

  const isActive = (path: string) => 
    location.pathname === path || location.pathname.startsWith(path + "/");

  const navLinkClass = (path: string) =>
    `relative px-3 py-1.5 text-sm font-medium transition ${
      isActive(path)
        ? "text-white"
        : "text-gray-400 hover:text-white"
    }`;

  return (
    <header className="fixed top-0 left-0 right-0 z-[10000] border-b border-white/8 bg-[#0a0f1a]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4 lg:px-6">
        {/* Left: Logo + Navigation */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => navigate("/zone")}
            className="flex items-center gap-2 text-lg font-bold text-white transition hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="hidden sm:inline">PyZone</span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            <button onClick={() => navigate("/zone")} className={navLinkClass("/zone")}>
              Explore
              {isActive("/zone") && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
              )}
            </button>
            <button onClick={() => navigate("/problems")} className={navLinkClass("/problems")}>
              Problems
              {isActive("/problems") && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
              )}
            </button>
            <button onClick={() => navigate("/contest")} className={navLinkClass("/contest")}>
              Contest
              {isActive("/contest") && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
              )}
            </button>
            <button onClick={() => navigate("/leaderboard")} className={navLinkClass("/leaderboard")}>
              Leaderboard
              {isActive("/leaderboard") && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
              )}
            </button>
          </nav>
        </div>

        {/* Right: Search + User */}
        <div className="flex items-center gap-4">
          <UserSearchDropdown />

          {username ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/profile/${encodeURIComponent(username)}`)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-bold text-white">
                  {username.slice(0, 2).toUpperCase()}
                </div>
                <span className="hidden lg:inline">{username}</span>
              </button>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg px-4 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
