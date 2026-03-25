import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { API_BASE_URL, userApi } from "../../lib/apiClient.js";

function resolveAvatarSrc(candidate) {
  if (!candidate) return "";
  try {
    return new URL(candidate, API_BASE_URL).toString();
  } catch {
    return candidate;
  }
}

export default function UserQuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const debounced = useDebouncedValue(query, 300);

  useEffect(() => {
    let cancelled = false;

    async function lookup() {
      if (!debounced.trim()) {
        setResults([]);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      try {
        const items = await userApi.searchUsers(debounced.trim());
        if (!cancelled) {
          setResults(items);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setStatus("error");
        }
      }
    }

    lookup();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="relative w-full max-w-[300px]">
      <input
        className="w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-gray-200 outline-none transition focus:border-gray-700 focus:ring-2 focus:ring-gray-700"
        placeholder="Search users..."
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[10001] w-[320px] max-h-[260px] overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-2 text-gray-200 shadow-xl">
          {status === "loading" ? <div className="px-3 py-2 text-sm text-gray-400">Searching...</div> : null}
          {status === "error" ? <div className="px-3 py-2 text-sm text-gray-400">Search unavailable</div> : null}
          {status === "ready" && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No users found</div>
          ) : null}
          {results.map((user) => (
            <button
              key={user.id}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-gray-800 hover:text-white"
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                navigate(`/profile/${encodeURIComponent(user.username)}`);
              }}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-800 bg-gray-950 text-xs font-semibold text-gray-200">
                {user.avatar_url ? (
                  <img
                    alt={`${user.username} avatar`}
                    className="h-full w-full object-cover"
                    src={resolveAvatarSrc(user.avatar_url)}
                  />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.display_name || user.username}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-400">
                  @{user.username} · {user.solved_count || 0} solved · {user.rating || 1200} rating
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
