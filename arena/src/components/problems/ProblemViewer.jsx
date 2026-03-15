import ReactMarkdown from "react-markdown";
import styles from "./ProblemViewer.module.css";

export default function ProblemViewer({ problem, loading }) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.lineLarge} />
        <div className={styles.line} />
        <div className={styles.card} />
        <div className={styles.line} />
        <div className={styles.card} />
      </div>
    );
  }

  if (!problem) {
    return <div className={styles.empty}>Select a problem to inspect the statement and constraints.</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <span className={`${styles.badge} ${styles[(problem.difficulty || "easy").toLowerCase()]}`}>
            {String(problem.difficulty || "easy").toUpperCase()}
          </span>
          <h2>{problem.title || problem.id}</h2>
        </div>
        <div className={styles.meta}>
          {problem.time_limit_seconds ? <span>Time {problem.time_limit_seconds}s</span> : null}
          {problem.memory_limit_mb ? <span>Memory {problem.memory_limit_mb}MB</span> : null}
          {problem.tags?.length ? <span>{problem.tags.join(" • ")}</span> : null}
        </div>
      </div>

      <div className={styles.body}>
        <ReactMarkdown>{problem.description || "No description available."}</ReactMarkdown>
      </div>
    </div>
  );
}
