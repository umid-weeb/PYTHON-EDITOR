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

function isEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = useMemo(() => normalizeNextPath(params.get("next")), [params]);
  const { isAuthenticated, register } = useAuth();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    country: "",
  });
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

    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();
    const country = form.country.trim();

    if (!username) {
      setError("Username is required.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        username,
        email: email || undefined,
        password: form.password,
        country,
      });
      navigate(next, { replace: true });
    } catch (submitError) {
      setError(submitError.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Join Arena to submit solutions, track momentum, and keep your competitive profile in sync."
      onSubmit={handleSubmit}
      submitLabel="Register"
      submitBusyLabel="Creating account..."
      isSubmitting={submitting}
      error={error}
      footer={
        <span>
          Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Login</Link>
        </span>
      }
    >
      <label className={styles.field}>
        <span className={styles.label}>Username</span>
        <input
          className={styles.input}
          autoComplete="username"
          placeholder="Choose a public handle"
          type="text"
          value={form.username}
          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          autoComplete="email"
          placeholder="Optional, but recommended"
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          autoComplete="new-password"
          placeholder="At least 6 characters"
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Confirm Password</span>
        <input
          className={styles.input}
          autoComplete="new-password"
          placeholder="Repeat your password"
          type="password"
          value={form.confirmPassword}
          onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Country</span>
        <input
          className={styles.input}
          autoComplete="country-name"
          placeholder="Uzbekistan"
          type="text"
          value={form.country}
          onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
        />
      </label>
    </AuthCard>
  );
}
