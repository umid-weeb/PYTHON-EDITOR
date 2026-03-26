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
      const normalized = debounced.trim().replace(/^@+/, "");
      if (!normalized) {
        setResults([]);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      try {
        const items = await userApi.searchUsers(normalized);
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
        className="h-[var(--h-input)] w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[var(--bg-input)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
        placeholder="Search users..."
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[10001] w-[320px] max-h-[260px] overflow-y-auto rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] p-2 text-[var(--text-primary)] shadow-[var(--shadow-md)]">
          {status === "loading" ? <div className="px-3 py-2 text-[12px] text-[var(--text-secondary)]">Searching...</div> : null}
          {status === "error" ? <div className="px-3 py-2 text-[12px] text-[var(--text-secondary)]">Search unavailable</div> : null}
          {status === "ready" && results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--text-secondary)]">No users found</div>
          ) : null}
          {results.map((user) => (
            <button
              key={user.id}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-[12px] text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                navigate(`/profile/${encodeURIComponent(user.username)}`);
              }}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-pill)] border border-[color:var(--border)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-primary)]">
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
                <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
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
