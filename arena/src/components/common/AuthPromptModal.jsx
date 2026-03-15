import { useNavigate } from "react-router-dom";
import styles from "./AuthPromptModal.module.css";

export default function AuthPromptModal({ open, problemId, onClose }) {
  const navigate = useNavigate();

  if (!open) return null;

  const next = problemId ? `/zone?problem=${encodeURIComponent(problemId)}&pending=submit` : "/zone?pending=submit";

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button className={styles.close} type="button" onClick={onClose}>
          ×
        </button>
        <div className={styles.eyebrow}>Auth required</div>
        <h2>Sign in to submit</h2>
        <p>Create an account or log in to send your solution to the judge and keep your progress.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)}>
            Login
          </button>
          <button type="button" className={styles.primary} onClick={() => navigate(`/register?next=${encodeURIComponent(next)}`)}>
            Create account
          </button>
        </div>
      </div>
    </div>
  );
}
