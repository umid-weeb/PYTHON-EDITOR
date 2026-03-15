import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { userApi } from "../../lib/apiClient.js";
import styles from "./UserQuickSearch.module.css";

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
    <div className={styles.shell}>
      <input
        className={styles.input}
        placeholder="Search users"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query ? (
        <div className={styles.dropdown}>
          {status === "loading" ? <div className={styles.state}>Searching...</div> : null}
          {status === "error" ? <div className={styles.state}>Search unavailable</div> : null}
          {status === "ready" && results.length === 0 ? (
            <div className={styles.state}>No users found</div>
          ) : null}
          {results.map((user) => (
            <button
              key={user.id}
              className={styles.result}
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                navigate(`/profile?username=${encodeURIComponent(user.username)}`);
              }}
            >
              <span className={styles.avatar}>{user.username.slice(0, 1).toUpperCase()}</span>
              <span>{user.username}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
