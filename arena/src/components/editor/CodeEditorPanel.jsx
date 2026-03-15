import Editor from "@monaco-editor/react";
import SubmitButton from "./SubmitButton.jsx";
import styles from "./CodeEditorPanel.module.css";

const languageMap = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
};

export default function CodeEditorPanel({
  code,
  language,
  isRunning,
  isSubmitting,
  onChange,
  onLanguageChange,
  onRun,
  onSubmit,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <select
            className={styles.select}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            <option value="python">Python 3.11</option>
            <option value="javascript">JavaScript</option>
            <option value="cpp">C++17</option>
          </select>
          <span className={styles.chip}>Function</span>
          <span className={`${styles.chip} ${styles.muted}`}>0 hidden</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.runButton} disabled={isRunning} type="button" onClick={onRun}>
            {isRunning ? "Running..." : "Run"}
          </button>
          <SubmitButton busy={isSubmitting} onClick={onSubmit} />
        </div>
      </div>

      <div className={styles.editorWrap}>
        <Editor
          theme="vs-dark"
          language={languageMap[language] || "python"}
          value={code}
          onChange={(value) => onChange(value || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            wordWrap: "on",
            padding: { top: 18 },
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
