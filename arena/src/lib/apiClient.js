import {
  clearStoredToken,
  readStoredToken,
  writeStoredToken,
} from "./storage.js";

const DEFAULT_API_BASE = import.meta.env.DEV ? "http://127.0.0.1:8000" : "https://python-editor-b87c.onrender.com";

let resolvedBase = String(
  import.meta.env.VITE_ARENA_API_BASE ?? DEFAULT_API_BASE
).replace(/\/+$/, "");

if (!import.meta.env.DEV && (resolvedBase === "" || resolvedBase.includes("localhost") || resolvedBase.includes("127.0.0.1"))) {
  resolvedBase = "https://python-editor-b87c.onrender.com";
}

export const API_BASE_URL = resolvedBase;

async function request(path, options = {}) {
  const token = options.token ?? readStoredToken();
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = raw
    ? isJson
      ? JSON.parse(raw)
      : (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        })()
    : null;

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function extractToken(payload) {
  const token =
    payload?.token ||
    payload?.access_token ||
    payload?.jwt ||
    payload?.access ||
    payload?.data?.token ||
    "";
  if (!token) {
    throw new Error("Auth token missing from server response");
  }
  return token;
}

export const authApi = {
  async login(credentials) {
    const payload = await request("/api/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    const token = extractToken(payload);
    writeStoredToken(token);
    return { ...payload, token };
  },
  async register(credentials) {
    const payload = await request("/api/register", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    const token = extractToken(payload);
    writeStoredToken(token);
    return { ...payload, token };
  },
  me(token) {
    return request("/api/me", { token });
  },
  async logout(token) {
    try {
      await request("/api/logout", { method: "POST", token });
    } finally {
      clearStoredToken();
    }
  },
};

export const arenaApi = {
  async getProblems() {
    const data = await request("/api/problems?per_page=200");
    return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  },
  async getProblem(problemKey) {
    try {
      return await request(`/api/problems/${encodeURIComponent(problemKey)}`);
    } catch (error) {
      if (error?.status === 404) {
        return request(`/api/problem/${encodeURIComponent(problemKey)}`);
      }
      throw error;
    }
  },
  runSolution(problemSlug, code, language, isExtended = false) {
    return request("/api/run", {
      method: "POST",
      body: JSON.stringify(buildSubmissionPayload(problemSlug, code, language, isExtended)),
    });
  },
  submitSolution(problemSlug, code, language, isExtended = false) {
    return request("/api/submit", {
      method: "POST",
      body: JSON.stringify(buildSubmissionPayload(problemSlug, code, language, isExtended)),
    });
  },
  getSubmission(submissionId, token) {
    return request(`/api/submission/${submissionId}`, { token });
  },
  async pollSubmission(submissionId, token) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const payload = await arenaApi.getSubmission(submissionId, token).catch(() => null);
      if (!payload) {
        await delay(700);
        continue;
      }
      if (payload.status === "queued" || payload.status === "pending" || payload.status === "running") {
        await delay(800);
        continue;
      }
      return payload;
    }
    throw new Error("Yuborish holatini kutish vaqti tugadi");
  },
  getDailyChallenge() {
    return request("/api/daily-challenge");
  },
};

export const userApi = {
  async searchUsers(query) {
    const normalized = String(query || "").trim().replace(/^@+/, "");
    if (!normalized) return [];

    try {
      const payload = await request(`/api/users/search?q=${encodeURIComponent(normalized)}`);
      return payload?.users || [];
    } catch (error) {
      // Fallback for older backend deployments where /api/users/search is shadowed
      // by /api/users/{username}. This keeps search usable until Render redeploys.
      const board = await request("/api/leaderboard").catch(() => []);
      return (Array.isArray(board) ? board : [])
        .filter((user) => String(user?.username || "").toLowerCase().includes(normalized.toLowerCase()))
        .slice(0, 10)
        .map((user) => ({
          id: user.user_id,
          username: user.username,
          display_name: user.username,
          avatar_url: user.avatar_url || null,
          rating: user.rating || 1200,
          solved_count: user.solved_count || user.solved || 0,
        }));
    }
  },
  getPublicProfile(username) {
    return request(`/api/users/${encodeURIComponent(username)}`);
  },
  getActivity() {
    return request("/api/user/activity");
  },
  getSubmissions() {
    return request("/api/user/submissions");
  },
  getMyStreak() {
    return request("/api/user/streak");
  },
  getMotivation() {
    return request("/api/motivation");
  },
  getUserStatsById(userId) {
    return request(`/api/users/${encodeURIComponent(userId)}/stats`);
  },
  getUserSubmissionsById(userId) {
    return request(`/api/users/${encodeURIComponent(userId)}/submissions`);
  },
  getLeaderboard() {
    return request("/api/leaderboard");
  },
  updateProfile(payload) {
    return request("/api/user/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  updatePassword(payload) {
    return request("/api/user/password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async uploadAvatar(file) {
    const body = new FormData();
    body.append("file", file);
    return request("/api/user/avatar", {
      method: "POST",
      body,
    });
  },
  requestPasswordReset(phone) {
    return request("/api/password/reset", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  },
  verifyPasswordReset(phone, code) {
    return request("/api/password/reset/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
  },
};

export const contestApi = {
  async list() {
    const data = await request("/api/contests");
    return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  },
  async get(id) {
    return request(`/api/contests/${encodeURIComponent(id)}`);
  },
  async getLeaderboard(id) {
    const data = await request(`/api/contests/${encodeURIComponent(id)}/leaderboard`);
    return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  },
};

export const aiApi = {
  async getReview(payload) {
    return request("/api/ai/review", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSubmissionPayload(problemSlug, code, language, isExtended = false) {
  const contestId = (() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return params.get("contest") || "";
    } catch {
      return "";
    }
  })();
  return {
    code,
    language,
    problemSlug,
    problem_id: problemSlug,
    contest_id: contestId || undefined,
    is_extended: isExtended,
  };
}
