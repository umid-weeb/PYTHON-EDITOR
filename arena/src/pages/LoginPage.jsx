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
  const { isAuthenticated, login } = useAuth();
  
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
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timer]);

  async function handleLogin(event) {
    if (event) event.preventDefault();
    setError("");

    if (!identifier.trim()) {
      setError("Username yoki Email kiritilmagan.");
      return;
    }
    if (!password) {
      setError("Parol kiritilmagan.");
      return;
    }

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
    } catch (submitError) {
      setError(submitError.message || "Kirishda xatolik");
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
    if (e) e.preventDefault();
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
    if (e) e.preventDefault();
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

  // Determine current form props based on state
  const currentTitle = isResetting ? "Parolni tiklash" : "Kirish";
  const currentSubtitle = !isResetting 
    ? "Arena-ga qayting, o'z natijalaringizni saqlang va masalalarni yechishda davom eting."
    : resetStep === 1 ? "Emailingizni kiriting, biz tasdiqlash kodini yuboramiz."
    : resetStep === 2 ? `Biz ${resetEmail} manziliga 4 xonali kod yubordik.`
    : "Endi yangi, xavfsiz parolingizni belgilang.";

  const currentOnSubmit = !isResetting ? handleLogin
    : resetStep === 1 ? handleResetRequest
    : resetStep === 2 ? handleResetVerify
    : handleResetConfirm;

  const currentSubmitLabel = !isResetting ? "Kirish"
    : resetStep === 1 ? "Kod yuborish"
    : resetStep === 2 ? "Kodni tasdiqlash"
    : "Parolni yangilash";

  const currentSubmitBusyLabel = !isResetting ? "Kirilmoqda..."
    : resetStep === 1 ? "Yuborilmoqda..."
    : resetStep === 2 ? "Tekshirilmoqda..."
    : "Saqlanmoqda...";

  return (
    <AuthCard
      title={currentTitle}
      subtitle={currentSubtitle}
      onSubmit={currentOnSubmit}
      submitLabel={currentSubmitLabel}
      submitBusyLabel={currentSubmitBusyLabel}
      isSubmitting={submitting}
      error={error}
      footer={
        isResetting ? (
          <span className={styles.forgotLink} onClick={() => { setIsResetting(false); setResetStep(1); setError(""); }}>
            Bekor qilish va Kirish sahifasiga qaytish
          </span>
        ) : (
          <div style={{ textAlign: "center" }}>
            Hali ro'yxatdan o'tmaganmisiz? <Link to={`/register?next=${encodeURIComponent(next)}`}>Ro'yxatdan o'tish</Link>
          </div>
        )
      }
    >
      {!isResetting ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Username yoki Email</span>
            <input
              className={styles.input}
              autoComplete="username"
              placeholder="isroilov0705 yoki you@example.com"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div style={{ textAlign: "right" }}>
            <span className={styles.forgotLink} onClick={() => { setIsResetting(true); setError(""); }}>
              Parolni unutdingizmi?
            </span>
          </div>
        </>
      ) : (
        <>
          {resetStep === 1 && (
            <div className={styles.field}>
              <input
                className={styles.input}
                placeholder="Email manzilingiz"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
          )}

          {resetStep === 2 && (
            <div className={styles.field}>
              <input
                className={styles.input}
                placeholder="4 xonali kod"
                maxLength={4}
                type="text"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                required
              />
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
            </div>
          )}

          {resetStep === 3 && (
            <div className={styles.field}>
              <input
                className={styles.input}
                placeholder="Yangi parol"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
          )}
        </>
      )}
    </AuthCard>
  );
}
