import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../components/auth/AuthCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./AuthPage.module.css";

function normalizeNextPath(rawNext) {
  if (!rawNext || typeof rawNext !== "string" || !rawNext.startsWith("/")) {
    return "/";
  }
  if (rawNext.startsWith("/zone")) {
    return rawNext.slice("/zone".length) || "/";
  }
  return rawNext;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = useMemo(() => normalizeNextPath(params.get("next")), [params]);
  const { isAuthenticated, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(next, { replace: true });
    }
  }, [isAuthenticated, navigate, next]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!identifier.trim()) {
      setError("Username or email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate(next, { replace: true });
    } catch (submitError) {
      setError(submitError.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Login"
      subtitle="Jump back into Arena, keep your drafts, and submit to the judge."
      onSubmit={handleSubmit}
      submitLabel="Login"
      submitBusyLabel="Logging in..."
      isSubmitting={submitting}
      error={error}
      footer={
        <span>
          New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create account</Link>
        </span>
      }
    >
      <label className={styles.field}>
        <span className={styles.label}>Username or Email</span>
        <input
          className={styles.input}
          autoComplete="username"
          placeholder="isroilov0705 or you@example.com"
          type="text"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          autoComplete="current-password"
          placeholder="Enter your password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
    </AuthCard>
  );
}
