import Editor from "@monaco-editor/react";
import { useRef } from "react";
import { useTheme } from "../../providers/ThemeProvider.tsx";

const languageMap = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
  sql: "sql",
};

const PythonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.2087 15.6547C15.9328 16.0396 15.5312 16.3245 15.071 16.4852C14.6108 16.6459 14.1147 16.6749 13.626 16.5701C12.3963 16.3059 11.233 15.7194 10.2332 14.861L9.63841 15.4558C9.53153 15.5682 9.40348 15.658 9.26189 15.7199C9.1203 15.7818 8.96803 15.8146 8.81408 15.8163C8.66014 15.8181 8.50762 15.7888 8.36551 15.7302C8.22341 15.6715 8.09457 15.5847 7.98687 15.4749C7.87917 15.3652 7.79478 15.2349 7.73881 15.0917C7.68284 14.9485 7.65641 14.7953 7.66105 14.6413C7.6657 14.4873 7.70131 14.3357 7.76575 14.1956C7.83019 14.0555 7.92215 13.9298 8.03608 13.8263L8.68066 13.2319C7.82226 12.2321 7.2358 11.0688 6.97155 9.83912C6.86676 9.35039 6.89578 8.84435 7.05649 8.38414C7.2172 7.92393 7.50212 7.52229 7.88701 7.24641C8.27191 6.97053 8.73016 6.82855 9.22744 6.83733C9.72473 6.84612 10.1989 7.00495 10.5925 7.30035L11.1872 6.70559C11.3006 6.59103 11.4362 6.50153 11.5857 6.4423C11.7352 6.38307 11.8953 6.3554 12.0561 6.36102C12.2168 6.36663 12.3746 6.4054 12.5193 6.47489C12.6641 6.54438 12.7924 6.64303 12.8961 6.76458C12.9998 6.88612 13.0767 7.0279 13.1219 7.18105C13.1672 7.3342 13.18 7.49534 13.1596 7.6543C13.1392 7.81326 13.086 7.96646 13.0031 8.10443C12.9202 8.2424 12.8095 8.3621 12.678 8.45607L12.0334 9.05045C12.8918 10.0503 13.4783 11.2136 13.7425 12.4433C13.8473 12.932 13.8183 13.4381 13.6576 13.8983C13.4969 14.3585 13.212 14.7601 12.8271 15.036C12.4422 15.3119 11.9839 15.4538 11.4866 15.4451C10.9894 15.4363 10.5152 15.2775 10.1216 14.9821L9.52684 15.5768C10.5266 16.4352 11.69 17.0217 12.9196 17.2859C13.4084 17.3907 13.9144 17.3617 14.3746 17.201C14.8348 17.0403 15.2365 16.7554 15.5123 16.3705C15.7882 15.9856 15.9302 15.5273 15.9214 15.0301C15.9126 14.5328 15.7538 14.0586 15.4584 13.665L16.0531 13.0702C16.1677 12.9556 16.3033 12.8661 16.4528 12.8069C16.6023 12.7477 16.7623 12.72 16.9232 12.7256C17.084 12.7312 17.2417 12.77 17.3865 12.8395C17.5312 12.9089 17.6596 13.0076 17.7633 13.1291C17.8669 13.2507 17.9439 13.3925 17.9891 13.5456C18.0343 13.6988 18.0471 13.8599 18.0267 14.0189C18.0064 14.1778 17.9531 14.331 17.8703 14.469C17.7874 14.607 17.6766 14.7267 17.5452 14.8206L16.2087 15.6547Z" fill="#3776AB"/>
  </svg>
);
const languageBadges = {
  python: { label: "Py", className: "bg-[#3776AB]/15 text-[#89B8FF]" },
  javascript: { label: "JS", className: "bg-[#F7DF1E]/15 text-[#E7CF22]" },
  cpp: { label: "C++", className: "bg-[#00599C]/15 text-[#8DBBFF]" },
  sql: { label: "SQL", className: "bg-emerald-500/15 text-emerald-300" },
};

function LanguageMark({ language }) {
  const meta = languageBadges[language] || languageBadges.python;
  return (
    <span
      className={["inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] border border-[color:var(--border)] px-2 text-[10px] font-bold tracking-[0.08em]", meta.className].join(" ")}
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
            <option value="sql">PostgreSQL</option>
            <option value="cpp">C++17</option>
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
