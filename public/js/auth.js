import { authApi, clearToken, getToken, setToken, fetchJson } from "./api.js";

export async function requireAuth(redirectBack = "/arena.html") {
  const token = getToken();
  if (!token) {
    window.location.href = `/login.html?next=${encodeURIComponent(redirectBack)}`;
    return false;
  }
  try {
    await authApi.me();
    return true;
  } catch {
    clearToken();
    window.location.href = `/login.html?next=${encodeURIComponent(redirectBack)}`;
    return false;
  }
}

export async function login(username, password) {
  const data = await authApi.login({ username, password });
  if (data?.access_token) setToken(data.access_token);
  return data;
}

export async function register(payload) {
  const data = await authApi.register(payload);
  if (data?.access_token) setToken(data.access_token);
  return data;
}

export async function logout() {
  try {
    // Call the backend logout endpoint to validate the token
    await fetchJson("/api/logout", { method: "POST" });
  } catch (error) {
    // Continue with logout even if backend call fails
    console.warn("Logout endpoint failed:", error);
  }
  
  // Clear all local storage and session storage
  clearToken();
  localStorage.removeItem("arena_pending_action");
  localStorage.removeItem("arena_pending_problem");
  localStorage.removeItem("access_token");
  sessionStorage.clear();
  
  // Redirect to arena page
  window.location.href = "/arena.html";
}
