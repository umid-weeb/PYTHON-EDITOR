(function configureArenaApiBase() {
  if (window.ARENA_API_BASE) {
    return;
  }

  const queryValue = new URLSearchParams(window.location.search).get("apiBase");
  const storedValue = window.localStorage.getItem("ARENA_API_BASE");
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocalStatic =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0";
  const shouldUseSameOrigin =
    port === "8080" ||
    port === "" ||
    window.location.protocol === "https:";

  window.ARENA_API_BASE =
    queryValue ||
    storedValue ||
    (isLocalStatic && !shouldUseSameOrigin
      ? "http://127.0.0.1:8000/api"
      : "/api");
})();
