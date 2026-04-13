/**
 * Admin Panel API Client
 * Faqat is_admin=true foydalanuvchilar uchun.
 */
import { API_BASE_URL } from "./apiClient.js";
import { readStoredToken } from "./storage.js";

async function adminRequest(path, options = {}) {
  const token = readStoredToken();
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  if (response.status === 204) return null;

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

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

function json(data) {
  return JSON.stringify(data);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export const adminApi = {
  // Stats
  getStats: () => adminRequest("/api/admin/stats"),

  // ---------------------------------------------------------------------------
  // Problems CRUD
  // ---------------------------------------------------------------------------
  getProblems: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.difficulty) qs.set("difficulty", params.difficulty);
    const query = qs.toString();
    return adminRequest(`/api/admin/problems${query ? "?" + query : ""}`);
  },

  getProblem: (problemId) => adminRequest(`/api/admin/problems/${problemId}`),

  createProblem: (data) =>
    adminRequest("/api/admin/problems", {
      method: "POST",
      body: json(data),
    }),

  updateProblem: (problemId, data) =>
    adminRequest(`/api/admin/problems/${problemId}`, {
      method: "PUT",
      body: json(data),
    }),

  deleteProblem: (problemId) =>
    adminRequest(`/api/admin/problems/${problemId}`, { method: "DELETE" }),

  // ---------------------------------------------------------------------------
  // Test Cases
  // ---------------------------------------------------------------------------
  addTestCase: (problemId, data) =>
    adminRequest(`/api/admin/problems/${problemId}/test-cases`, {
      method: "POST",
      body: json(data),
    }),

  updateTestCase: (tcId, data) =>
    adminRequest(`/api/admin/test-cases/${tcId}`, {
      method: "PUT",
      body: json(data),
    }),

  deleteTestCase: (tcId) =>
    adminRequest(`/api/admin/test-cases/${tcId}`, { method: "DELETE" }),

  bulkReplaceTestCases: (problemId, testCases) =>
    adminRequest(`/api/admin/problems/${problemId}/test-cases/bulk`, {
      method: "POST",
      body: json(testCases),
    }),

  // ---------------------------------------------------------------------------
  // Admin management (legacy)
  // ---------------------------------------------------------------------------
  setAdmin: (email, isAdmin = true) =>
    adminRequest("/api/admin/set-admin", {
      method: "POST",
      body: json({ email, is_admin: isAdmin }),
    }),

  activateSelf: () =>
    adminRequest("/api/admin/activate-self", { method: "POST" }),

  // ---------------------------------------------------------------------------
  // Team management
  // ---------------------------------------------------------------------------
  team: {
    list: () => adminRequest("/api/admin/team"),

    add: ({ identifier, password, permissions }) =>
      adminRequest("/api/admin/team/add", {
        method: "POST",
        body: json({ identifier, password, permissions }),
      }),

    updatePermissions: (userId, permissions) =>
      adminRequest(`/api/admin/team/${userId}/permissions`, {
        method: "PUT",
        body: json({ permissions }),
      }),

    remove: (userId, password) =>
      adminRequest(`/api/admin/team/${userId}`, {
        method: "DELETE",
        body: json({ password }),
      }),

    transferOwnership: ({ target_email, password }) =>
      adminRequest("/api/admin/team/transfer-ownership", {
        method: "POST",
        body: json({ target_email, password }),
      }),

    changePassword: ({ old_password, new_password }) =>
      adminRequest("/api/admin/team/password", {
        method: "PUT",
        body: json({ old_password, new_password }),
      }),
  },

  // ---------------------------------------------------------------------------
  // AI endpoints
  // ---------------------------------------------------------------------------
  ai: {
    // LeetCode masalasini nom/raqam orqali olish
    fromLeetCode: (query) =>
      adminRequest("/api/admin/ai/from-leetcode", {
        method: "POST",
        body: json({ query }),
      }),

    // Description yaratish
    generateDescription: (data) =>
      adminRequest("/api/admin/ai/generate-description", {
        method: "POST",
        body: json(data),
      }),

    // Description yaxshilash
    improveDescription: (data) =>
      adminRequest("/api/admin/ai/improve-description", {
        method: "POST",
        body: json(data),
      }),

    // Starter code yaratish
    generateStarterCode: (data) =>
      adminRequest("/api/admin/ai/generate-starter-code", {
        method: "POST",
        body: json(data),
      }),

    // Test case yaratish
    generateTestCases: (data) =>
      adminRequest("/api/admin/ai/generate-test-cases", {
        method: "POST",
        body: json(data),
      }),

    // Test case larni tekshirish
    validateTestCases: (data) =>
      adminRequest("/api/admin/ai/validate-test-cases", {
        method: "POST",
        body: json(data),
      }),
  },
};
