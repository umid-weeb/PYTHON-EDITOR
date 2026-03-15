import styles from "./TestCasePanel.module.css";

export default function TestCasePanel({ cases = [], activeIndex, onSelect }) {
  if (!cases.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>Visible Test Cases</h3>
          <span>0 cases</span>
        </div>
        <div className={styles.empty}>Select a problem to inspect the sample cases.</div>
      </div>
    );
  }

  const activeCase = cases[activeIndex] || cases[0];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Visible Test Cases</h3>
        <span>{cases.length} cases</span>
      </div>
      <div className={styles.tabs}>
        {cases.map((testCase, index) => (
          <button
            key={`${testCase.input}-${index}`}
            className={`${styles.tab} ${activeIndex === index ? styles.active : ""}`}
            type="button"
            onClick={() => onSelect(index)}
          >
            Case {index + 1}
          </button>
        ))}
      </div>
      <div className={styles.viewer}>
        <section>
          <div className={styles.label}>Input</div>
          <pre>{activeCase.input || "No input"}</pre>
        </section>
        <section>
          <div className={styles.label}>Expected output</div>
          <pre>{activeCase.expected_output || "No expected output"}</pre>
        </section>
      </div>
    </div>
  );
}
