import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../lib/apiClient.js";
import {
  clearStoredToken,
  readStoredToken,
  writeStoredUsername,
  clearStoredUsername,
} from "../lib/storage.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readStoredToken());
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(token ? "loading" : "ready");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!token) {
        setUser(null);
        setStatus("ready");
        return;
      }

      if (user) {
        setStatus("ready");
        return;
      }

      setStatus("loading");
      try {
        const me = await authApi.me(token);
        if (!cancelled) {
          setUser(me);
          writeStoredUsername(me.username);
          setStatus("ready");
        }
      } catch (error) {
        // ONLY logout on 401 Unauthorized.
        // If 5xx (Server Error), don't wipe the token. The user might still be valid.
        if (error?.status === 401) {
          clearStoredToken();
          if (!cancelled) {
            setToken("");
            setUser(null);
          }
        }
        if (!cancelled) {
          setStatus("ready");
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      token,
      user,
      status,
      isAuthenticated: Boolean(user),
      isAdmin: Boolean(user?.is_admin),
      isOwner: Boolean(user?.is_owner),
      async login(username, password) {
        setStatus("loading");
        try {
          const payload = await authApi.login({ username, password });
          const token = payload.token;
          setToken(token);
          const me = payload.user ? payload.user : await authApi.me(token);
          setUser(me);
          writeStoredUsername(me.username);
          setStatus("ready");
          return payload;
        } catch (error) {
          clearStoredToken();
          setToken("");
          setUser(null);
          setStatus("ready");
          throw error;
        }
      },
      async register(data) {
        setStatus("loading");
        try {
          const payload = await authApi.register(data);
          const token = payload.token;
          setToken(token);
          const me = payload.user ? payload.user : await authApi.me(token);
          setUser(me);
          writeStoredUsername(me.username);
          setStatus("ready");
          return payload;
        } catch (error) {
          clearStoredToken();
          setToken("");
          setUser(null);
          setStatus("ready");
          throw error;
        }
      },
      async refreshUser() {
        if (!token) return null;
        const me = await authApi.me(token);
        setUser(me);
        return me;
      },
      async logout() {
        await authApi.logout(token);
        clearStoredToken();
        setToken("");
        setUser(null);
      },
    }),
    [status, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
