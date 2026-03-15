import styles from "./ResultPanel.module.css";

export default function ResultPanel({ result }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h3>Result</h3>
          <p>{result.summary}</p>
        </div>
        <span className={`${styles.chip} ${styles[result.tone] || ""}`}>{result.chip}</span>
      </div>
      <div className={styles.body}>
        {result.details?.length ? (
          result.details.map((entry) => (
            <div key={entry.id} className={styles.row}>
              <div>
                <div className={styles.rowTitle}>{entry.label}</div>
                <div className={styles.rowVerdict}>{entry.verdict}</div>
              </div>
              {(entry.runtime || entry.memory) && (
                <div className={styles.metrics}>
                  {entry.runtime ? <span>{entry.runtime}</span> : null}
                  {entry.memory ? <span>{entry.memory}</span> : null}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className={styles.empty}>Run or submit a solution to see the verdict and test details.</div>
        )}
      </div>
    </div>
  );
}
