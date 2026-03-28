import { useEffect, useState } from "react";
import { arenaApi } from "../../lib/apiClient";
import Editor from "@monaco-editor/react";

type Props = {
  submissionId: string | null;
  onClose: () => void;
};

export default function SubmissionDetailsModal({ submissionId, onClose }: Props) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submissionId) return;

    let mounted = true;
    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const data = await arenaApi.getSubmissionStatus(submissionId);
        if (mounted) setDetails(data);
      } catch (err: any) {
        if (mounted) setError(err.message || "Yechim tafsilotlarini yuklashda xatolik.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDetails();
    return () => { mounted = false; };
  }, [submissionId]);

  if (!submissionId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[var(--bg-subtle)]/50 px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Yechim Tafsilotlari</h2>
            {details && (
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  details.verdict === "accepted" ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--danger-bg)] text-[var(--danger)]"
                }`}>
                  {details.verdict || details.status}
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono">#{submissionId.slice(0, 8)}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--accent)] border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 text-3xl text-[var(--danger)]">⚠️</div>
              <p className="text-[var(--text-secondary)]">{error}</p>
            </div>
          ) : details ? (
            <>
              {/* Left Side: Code */}
              <div className="flex flex-[1.5] flex-col border-b border-[color:var(--border)] lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between bg-[var(--bg-subtle)]/30 px-4 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Source Code ({details.language})</span>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <Editor
                    theme="vs-dark"
                    language={details.language === "python" ? "python" : details.language}
                    value={details.code || ""}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      padding: { top: 16, bottom: 16 },
                      lineNumbersMinChars: 3,
                    }}
                  />
                </div>
              </div>

              {/* Right Side: Results */}
              <div className="flex flex-1 flex-col bg-[var(--bg-subtle)]/10 overflow-hidden">
                <div className="flex items-center bg-[var(--bg-subtle)]/30 px-4 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Test Natijalari</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                   {/* Summary Stats */}
                   <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm">
                      <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1">Runtime</div>
                      <div className="text-sm font-bold font-mono">{details.runtime_ms ?? "--"} ms</div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm">
                      <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1">Memory</div>
                      <div className="text-sm font-bold font-mono">{details.memory_kb ? (details.memory_kb / 1024).toFixed(2) : "--"} MB</div>
                    </div>
                  </div>

                  {/* Case Results */}
                  <div className="space-y-2">
                    {details.case_results?.map((res: any, idx: number) => (
                      <div key={idx} className={`flex items-center justify-between rounded-lg border p-3 shadow-sm ${
                        res.verdict === "accepted" ? "border-[color:var(--success)]/20 bg-[var(--success-bg)]/5" : "border-[color:var(--danger)]/20 bg-[var(--danger-bg)]/5"
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                             res.verdict === "accepted" ? "bg-[var(--success)] text-white" : "bg-[var(--danger)] text-white"
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-xs font-medium text-[var(--text-primary)]">
                            {res.verdict === "accepted" ? "To'g'ri" : res.verdict === "wrong_answer" ? "Xato javob" : res.verdict}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">
                          {res.runtime_ms}ms · {(res.memory_kb / 1024).toFixed(1)}MB
                        </div>
                      </div>
                    ))}
                  </div>

                  {details.error_text && (
                    <div className="rounded-lg border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/5 p-4">
                      <div className="mb-2 text-[10px] font-bold uppercase text-[var(--danger)]">Error Output</div>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--danger)] leading-relaxed">
                        {details.error_text}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-[color:var(--border)] bg-[var(--bg-subtle)]/50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
