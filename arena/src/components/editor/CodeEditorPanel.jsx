import Editor from "@monaco-editor/react";
import { useRef } from "react";
import { useTheme } from "../../providers/ThemeProvider.tsx";

const languageMap = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
  java: "java",
  go: "go",
  sql: "sql",
};

const languageBadges = {
  python: { label: "Py", className: "bg-[#3776AB]/15 text-[#89B8FF]" },
  javascript: { label: "JS", className: "bg-[#F7DF1E]/15 text-[#E7CF22]" },
  cpp: { label: "C++", className: "bg-[#00599C]/15 text-[#8DBBFF]" },
  java: { label: "Java", className: "bg-[#F89820]/15 text-[#FFBF73]" },
  go: { label: "Go", className: "bg-[#00ADD8]/15 text-[#5CCFE6]" },
  sql: { label: "SQL", className: "bg-emerald-500/15 text-emerald-300" },
};

function LanguageMark({ language }) {
  const meta = languageBadges[language] || languageBadges.python;
  return (
    <span
      className={[
        "inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] border border-[color:var(--border)] px-2 text-[10px] font-bold tracking-[0.08em]",
        meta.className,
      ].join(" ")}
    >
      {meta.label}
    </span>
  );
}

export default function CodeEditorPanel({
  code,
  language,
  isRunning,
  isSubmitting,
  runCooldown = 0,
  submitCooldown = 0,
  onCodeChange,
  onLanguageChange,
  onRun,
  onSubmit,
}) {
  const { theme } = useTheme();
  const editorRef = useRef(null);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const formatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction("editor.action.formatDocument").run();
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-[color:var(--border)] bg-[var(--bg-surface)]">
      <div className="flex h-[var(--h-toolbar)] shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3">
        <div className="flex items-center gap-2 rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-input)] px-2 h-[var(--h-input)]">
          <LanguageMark language={language} />
          <select
            className="bg-transparent text-[12px] text-[var(--text-primary)] outline-none"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            <option value="python">Python 3.11</option>
            <option value="javascript">JavaScript</option>
            <option value="cpp">C++17</option>
            <option value="java">Java</option>
            <option value="go">Go</option>
            <option value="sql">PostgreSQL</option>
          </select>
        </div>

        <button
          onClick={formatCode}
          className="inline-flex h-[var(--h-btn-md)] items-center gap-1.5 rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
          title="Kodni tartibga solish"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Sazlash
        </button>

        <div className="flex-1" />

        <button
          className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border-strong)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRunning || runCooldown > 0}
          type="button"
          onClick={onRun}
        >
          {isRunning ? "Ishlayapti..." : runCooldown > 0 ? `Sinash (${runCooldown}s)` : "Sinash"}
        </button>
        <button
          className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] bg-[var(--accent)] px-4 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting || submitCooldown > 0}
          type="button"
          onClick={onSubmit}
        >
          {isSubmitting ? "Yuborilmoqda..." : submitCooldown > 0 ? `Yuborish (${submitCooldown}s)` : "Yuborish"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={languageMap[language] || "python"}
          onMount={handleEditorMount}
          options={{
            automaticLayout: true,
            fontSize: 13,
            minimap: { enabled: false },
            padding: { top: 12 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          value={code}
          onChange={(value) => onCodeChange(value || "")}
        />
      </div>
    </div>
  );
}
