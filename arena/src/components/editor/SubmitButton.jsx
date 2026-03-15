import styles from "./SubmitButton.module.css";

export default function SubmitButton({ busy, onClick }) {
  return (
    <button className={styles.button} disabled={busy} type="button" onClick={onClick}>
      {busy ? "Submitting..." : "Submit"}
    </button>
  );
}
