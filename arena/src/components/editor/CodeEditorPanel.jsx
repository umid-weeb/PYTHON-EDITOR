import Editor from "@monaco-editor/react";
import { useTheme } from "../../providers/ThemeProvider.tsx";

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
  const { theme } = useTheme();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-[color:var(--border)] bg-[var(--bg-surface)]">
      <div className="flex h-[var(--h-toolbar)] shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3">
        <select
          className="h-[var(--h-input)] min-w-[128px] rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-input)] px-2 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
        >
          <option value="python">Python 3.11</option>
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++17</option>
        </select>

        <div className="flex-1" />

        <button
          className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border-strong)] px-4 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRunning || isSubmitting}
          type="button"
          onClick={onRun}
        >
          {isRunning ? "Ishlayapti..." : "Sinash"}
        </button>
        <button
          className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] bg-[var(--accent)] px-4 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="button"
          onClick={onSubmit}
        >
          {isSubmitting ? "Yuborilmoqda..." : "Yuborish"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={languageMap[language] || "python"}
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
          onChange={(value) => onChange(value || "")}
        />
      </div>
    </div>
  );
}
