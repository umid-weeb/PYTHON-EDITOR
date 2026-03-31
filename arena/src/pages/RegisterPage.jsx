import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../components/auth/AuthCard.jsx";
import GoogleAuthButton from "../components/auth/GoogleAuthButton.jsx";
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
  const { isAuthenticated, register, loginWithGoogle, completeGoogleSignup } = useAuth();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    country: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleOnboarding, setGoogleOnboarding] = useState(null);
  const [googleUsername, setGoogleUsername] = useState("");

  useEffect(() => {
    if (isAuthenticated && !googleOnboarding) {
      navigate(next, { replace: true });
    }
  }, [googleOnboarding, isAuthenticated, navigate, next]);

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

  async function handleGoogleCredential(credential) {
    setSubmitting(true);
    setError("");
    try {
      const payload = await loginWithGoogle(credential);
      if (payload?.needs_onboarding) {
        setGoogleOnboarding(payload);
        setGoogleUsername(payload.suggested_username || "");
      }
    } catch (submitError) {
      setError(submitError.message || "Google bilan ro'yxatdan o'tishda xatolik");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleComplete(event) {
    event.preventDefault();
    setError("");

    if (!googleUsername.trim()) {
      setError("Username is required.");
      return;
    }
    if (googleUsername.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await completeGoogleSignup({
        onboarding_token: googleOnboarding.onboarding_token,
        username: googleUsername.trim(),
      });
      navigate(next, { replace: true });
    } catch (submitError) {
      setError(submitError.message || "Google accountni yakunlashda xatolik");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title={googleOnboarding ? "Username tanlang" : "Create account"}
      subtitle={
        googleOnboarding
          ? `${googleOnboarding.email} Google akkaunti topildi. Davom etish uchun username tanlang.`
          : "Join Arena to submit solutions, track momentum, and keep your competitive profile in sync."
      }
      onSubmit={googleOnboarding ? handleGoogleComplete : handleSubmit}
      submitLabel={googleOnboarding ? "Continue" : "Register"}
      submitBusyLabel={googleOnboarding ? "Finishing setup..." : "Creating account..."}
      isSubmitting={submitting}
      error={error}
      footer={
        googleOnboarding ? (
          <span className={styles.forgotLink} onClick={() => { setGoogleOnboarding(null); setGoogleUsername(""); setError(""); }}>
            Bekor qilish va Register sahifasiga qaytish
          </span>
        ) : (
          <span>
            Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Login</Link>
          </span>
        )
      }
    >
      {googleOnboarding ? (
        <>
          <p className={styles.helperText}>
            Email, ism va avatar Google'dan avtomatik olinadi. Siz faqat public username tanlaysiz.
          </p>
          <label className={styles.field}>
            <span className={styles.label}>Username</span>
            <input
              className={styles.input}
              autoComplete="username"
              placeholder="Choose a public handle"
              type="text"
              value={googleUsername}
              onChange={(event) => setGoogleUsername(event.target.value)}
            />
          </label>
        </>
      ) : (
        <>
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
          <GoogleAuthButton onCredential={handleGoogleCredential} onError={(submitError) => setError(submitError.message || "Google tugmasini yuklab bo'lmadi")} text="signup_with" />
        </>
      )}
    </AuthCard>
  );
}
