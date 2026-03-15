import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { userApi } from "../../lib/apiClient.js";

export default function UserQuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const debounced = useDebouncedValue(query, 250);

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
        className="w-full rounded-2xl border border-arena-border bg-[rgba(4,10,22,0.64)] px-4 py-[13px] text-arena-text outline-none transition focus:border-arena-borderStrong focus:ring-4 focus:ring-[rgba(108,146,255,0.1)]"
        placeholder="Search users"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query ? (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 grid gap-2 rounded-[18px] border border-arena-border bg-[rgba(10,18,34,0.97)] p-2.5 shadow-arena">
          {status === "loading" ? <div className="px-2 py-1.5 text-sm text-arena-muted">Searching...</div> : null}
          {status === "error" ? <div className="px-2 py-1.5 text-sm text-arena-muted">Search unavailable</div> : null}
          {status === "ready" && results.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-arena-muted">No users found</div>
          ) : null}
          {results.map((user) => (
            <button
              key={user.id}
              className="flex w-full items-center gap-3 rounded-[14px] bg-white/5 px-3 py-2.5 text-left text-arena-text transition hover:bg-[rgba(108,146,255,0.12)]"
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                navigate(`/profile?username=${encodeURIComponent(user.username)}`);
              }}
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-arena-border bg-[rgba(108,146,255,0.08)] text-sm font-semibold text-arena-primaryStrong">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              <span>{user.username}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
