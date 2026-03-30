import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthCard from "../components/auth/AuthCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../lib/apiClient.js";
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
  const { isAuthenticated, login, refreshUser } = useAuth();
  
  // Login State
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset State
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: Code, 3: New Password
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && !isResetting) {
      navigate(next, { replace: true });
    }
  }, [isAuthenticated, isResetting, navigate, next]);

  // Timer logic
  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timer]);

  async function handleLogin(event) {
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
    } catch (submitError) {
      setError(submitError.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e) {
    if (e) e.preventDefault();
    if (!resetEmail.trim()) {
      setError("Email manzilini kiritishingiz kerak.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await authApi.requestPasswordReset(resetEmail.trim());
      setResetStep(2);
      setTimer(60);
    } catch (err) {
      setError(err.message || "Kod yuborishda xatolik");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetVerify(e) {
    e.preventDefault();
    if (resetCode.length !== 4) {
      setError("Tasdiqlash kodi 4 xonali bo'lishi kerak.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await authApi.verifyPasswordReset(resetEmail, resetCode);
      setResetStep(3);
    } catch (err) {
      setError(err.message || "Kod noto'g'ri yoki vaqti o'tgan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetConfirm(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Yangi parol kamida 6 belgidan iborat bo'lishi kerak.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await authApi.confirmPasswordReset(resetEmail, resetCode, newPassword);
      // Success - log them in automatically
      await login(resetEmail, newPassword);
      setIsResetting(false);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || "Parolni yangilashda xatolik");
    } finally {
      setSubmitting(false);
    }
  }

  if (isResetting) {
    return (
      <AuthCard
        title="Parolni tiklash"
        subtitle={
          resetStep === 1 ? "Emailingizni kiriting, biz tasdiqlash kodini yuboramiz." :
          resetStep === 2 ? `Biz ${resetEmail} manziliga 4 xonali kod yubordik.` :
          "Endi yangi, xavfsiz parolingizni belgilang."
        }
        error={error}
        footer={
          <span className={styles.forgotLink} onClick={() => { setIsResetting(false); setResetStep(1); setError(""); }}>
            Bekor qilish va Kirish sahifasiga qaytish
          </span>
        }
      >
        {resetStep === 1 && (
          <form onSubmit={handleResetRequest} className={styles.field}>
            <input
              className={styles.input}
              placeholder="Email manzilingiz"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? "Yuborilmoqda..." : "Kod yuborish"}
            </button>
          </form>
        )}

        {resetStep === 2 && (
          <form onSubmit={handleResetVerify} className={styles.field}>
            <input
              className={styles.input}
              placeholder="4 xonali kod"
              maxLength={4}
              type="text"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
              required
            />
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? "Tekshirilmoqda..." : "Kodni tasdiqlash"}
            </button>
            <div className={styles.timer}>
              {timer > 0 ? (
                `Kodni qayta yuborish: ${timer}s`
              ) : (
                <>
                  Kod kelmadimi? 
                  <button className={styles.resendBtn} onClick={handleResetRequest} type="button">
                    Yangi kod olish
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {resetStep === 3 && (
          <form onSubmit={handleResetConfirm} className={styles.field}>
            <input
              className={styles.input}
              placeholder="Yangi parol"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button className={styles.primary} disabled={submitting} type="submit">
              {submitting ? "Saqlanmoqda..." : "Parolni yangilash"}
            </button>
          </form>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Kirish"
      subtitle="Arena-ga qayting, o'z natijalaringizni saqlang va masalalarni yechishda davom eting."
      onSubmit={handleLogin}
      submitLabel="Kirish"
      submitBusyLabel="Kirilmoqda..."
      isSubmitting={submitting}
      error={error}
      footer={
        <div style={{ textAlign: "center" }}>
          <div>
            Hali ro'yxatdan o'tmaganmisiz? <Link to={`/register?next=${encodeURIComponent(next)}`}>Ro'yxatdan o'tish</Link>
          </div>
        </div>
      }
    >
      <label className={styles.field}>
        <span className={styles.label}>Username yoki Email</span>
        <input
          className={styles.input}
          autoComplete="username"
          placeholder="isroilov0705 yoki you@example.com"
          type="text"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Parol</span>
        <input
          className={styles.input}
          autoComplete="current-password"
          placeholder="Parolingizni kiriting"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <div style={{ textAlign: "right" }}>
        <span className={styles.forgotLink} onClick={() => setIsResetting(true)}>
          Parolni unutdingizmi?
        </span>
      </div>
    </AuthCard>
  );
}
