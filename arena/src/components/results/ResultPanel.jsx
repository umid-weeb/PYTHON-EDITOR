import { useState, useEffect } from "react";

function Spinner() {
  return (
    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
  );
}

function statusTone(tone) {
  if (tone === "success") return "text-[var(--success)]";
  if (tone === "danger") return "text-[var(--error)]";
  if (tone === "warning") return "text-[var(--warning)]";
  return "text-[var(--text-primary)]";
}

function StatusChip({ verdict, tone }) {
  const bgColor = tone === "success" ? "bg-[var(--success)]/10" : tone === "danger" ? "bg-[var(--error)]/10" : "bg-[var(--warning)]/10";
  const textColor = tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-[var(--error)]" : "text-[var(--warning)]";
  
  return (
    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-bold ${bgColor} ${textColor}`}>
      {verdict}
    </div>
  );
}

function CodeBlock({ label, value }) {
  if (value === undefined || value === null) return null;
  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

  return (
    <div className="flex flex-col gap-1.5 mt-3">
      <div className="text-[12px] font-medium text-[var(--text-secondary)]">{label} =</div>
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-[13px] text-[var(--text-primary)] whitespace-pre-wrap break-all">
        {displayValue}
      </div>
    </div>
  );
}

export default function ResultPanel({ result, busy = false }) {
  const [activeCaseId, setActiveCaseId] = useState("1");
  const details = Array.isArray(result?.details) ? result.details : [];
  const hasDetails = details.length > 0;
  
  // Auto-select first case if active one is missing or when results change
  useEffect(() => {
    if (hasDetails) {
      const exists = details.find(d => d.id === activeCaseId);
      if (!exists) {
        setActiveCaseId(details[0].id);
      }
    }
  }, [result, hasDetails]);

  const activeCase = details.find((d) => d.id === activeCaseId) || details[0];

  if (busy && !hasDetails) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner />
          <div className="text-[14px] font-medium text-[var(--text-secondary)]">
            Tekshiruvchi bajarishni yakunlamoqda...
          </div>
        </div>
      </div>
    );
  }

  if (!result || (!hasDetails && !busy)) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-6 text-center">
        <div className="text-[14px] text-[var(--text-muted)]">
          Natijani ko'rish uchun kodni ishga tushiring (Sinash) yoki yuboring (Yuborish).
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]">
      {/* Header Info */}
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
            <StatusChip verdict={result.chip} tone={result.tone} />
            <div className="text-[13px] text-[var(--text-secondary)]">
                {result.runtime && `Runtime: ${result.runtime}`}
            </div>
        </div>
        {busy && <Spinner />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {/* Main Status / Summary */}
        <div className={`mb-4 text-[13px] ${statusTone(result.tone)}`}>
          {result.summary}
        </div>

        {hasDetails && (
          <div className="flex flex-col gap-4">
            {/* Case Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-2">
              {details.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setActiveCaseId(entry.id)}
                  className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition ${
                    activeCaseId === entry.id
                      ? "bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${entry.passed ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
                  {entry.label}
                </button>
              ))}
            </div>

            {/* Selected Case Content */}
            {activeCase && (
              <div className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200">
                <CodeBlock label="Input" value={activeCase.input} />
                <CodeBlock label="Output" value={activeCase.actual} />
                <CodeBlock label="Expected" value={activeCase.expected} />
                
                {activeCase.error && (
                    <div className="mt-4 rounded-[var(--radius-sm)] border border-[color:var(--error)]/20 bg-[var(--error)]/5 p-3">
                        <div className="text-[12px] font-bold text-[var(--error)] mb-1">Xatolik:</div>
                        <div className="font-mono text-[12px] text-[var(--error)] leading-relaxed whitespace-pre-wrap italic">
                            {activeCase.error}
                        </div>
                    </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
