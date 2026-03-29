import { useState, useEffect } from "react";

function Spinner() {
  return (
    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
  );
}

function CodeBlock({ label, value, placeholder = "Ma'lumot mavjud emas", highlight = false }) {
  const displayValue = value === undefined || value === null || String(value).trim() === "" 
    ? placeholder 
    : (typeof value === 'object' ? JSON.stringify(value) : String(value));

  const isPlaceholder = displayValue === placeholder;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-tight">{label}</div>
      <div className={`rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-4 py-3 font-mono text-[13px] whitespace-pre-wrap break-all leading-relaxed ${isPlaceholder ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'} ${highlight ? 'ring-1 ring-[var(--error)]/20' : ''}`}>
        {displayValue}
      </div>
    </div>
  );
}

export default function ResultPanel({ result, busy = false }) {
  const [activeCaseId, setActiveCaseId] = useState("1");
  const details = Array.isArray(result?.details) ? result.details : [];
  const hasDetails = details.length > 0;
  
  useEffect(() => {
    if (hasDetails) {
      const exists = details.find(d => d.id === activeCaseId);
      if (!exists) {
        setActiveCaseId(details[0].id);
      }
    }
  }, [result, hasDetails]);

  const activeCase = details.find((d) => d.id === activeCaseId) || details[0];

  // True idle: the initial state before the user has run anything.
  // We detect this by tone=info AND the chip being a known idle label.
  const IDLE_CHIPS = new Set(["Ma'lumot", "Tayyor", "Natija"]);
  const isIdle =
    !busy &&
    !hasDetails &&
    (result?.tone === "info" || !result?.tone) &&
    (!result?.chip || IDLE_CHIPS.has(result.chip));

  if (isIdle) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-8 text-center">
        <div className="max-w-[300px] flex flex-col gap-2">
            <div className="text-[15px] font-bold text-[var(--text-primary)]">Hozircha natija yo'q</div>
            <div className="text-[13px] text-[var(--text-muted)]">
                Natijani ko'rish uchun "Sinash" yoki "Yuborish" tugmasini bosing.
            </div>
        </div>
      </div>
    );
  }

  // Full-screen error fallback: If we are not busy, have no details, and are not in a known idle state,
  // it means something went wrong (e.g. backend crash or network error).
  if (!busy && !hasDetails && !isIdle && result?.tone === "danger") {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-8">
        <div className="max-w-[380px] flex flex-col gap-4 text-center">
          <div className="text-[20px] font-black tracking-tight text-[var(--error)]">
            {result.chip || "Xatolik"}
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[color:var(--error)]/30 bg-[var(--error)]/5 p-4 font-mono text-[13px] text-[var(--error)] whitespace-pre-wrap leading-relaxed shadow-inner">
            {result.summary || "Bajarishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."}
          </div>
        </div>
      </div>
    );
  }

  // Full-screen spinner: run started but no result yet
  if (busy && !hasDetails) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner />
          <div className="text-[14px] font-medium text-[var(--text-secondary)]">
            Tekshiruvchi bajarishni yakunlamoqda...
          </div>
        </div>
      </div>
    );
  }

  const isAccepted = result.tone === "success" || String(result.status).toLowerCase().includes("accepted");


  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]">
      {/* Header Info */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[color:var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
            <div className={`text-[20px] font-black tracking-tight ${result.tone === "success" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                {result.chip}
            </div>
            {busy && <Spinner />}
        </div>
        <div className="flex gap-4 text-[13px] text-[var(--text-muted)]">
            {result.runtime && (
                <div className="flex items-center gap-1.5 font-medium">
                    <span>Vaqt:</span>
                    <span className="text-[var(--text-primary)]">{result.runtime}</span>
                </div>
            )}
            {result.memory && (
                <div className="flex items-center gap-1.5 font-medium">
                    <span>Xotira:</span>
                    <span className="text-[var(--text-primary)]">{result.memory}</span>
                </div>
            )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-4">
        {/* Spinner while running with existing partial result */}
      {busy && <div className="flex shrink-0 items-center justify-center gap-2 border-b border-[color:var(--border)] px-6 py-2 text-[13px] text-[var(--text-muted)]"><Spinner /> Tekshirilmoqda...</div>}

      {/* Non-detail result (backend error, network failure, etc) */}
      {!hasDetails && !busy && result?.summary ? (
        <div className="flex h-full items-center justify-center bg-[var(--bg-surface)] p-8">
          <div className="max-w-[380px] flex flex-col gap-3 text-center">
            <div className={`text-[20px] font-black tracking-tight ${result.tone === "success" ? "text-[var(--success)]" : result.tone === "warning" ? "text-[var(--warning,#f59e0b)]" : "text-[var(--error)]"}`}>
              {result.chip}
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[color:var(--error)]/30 bg-[var(--error)]/5 p-4 font-mono text-[13px] text-[var(--error)] whitespace-pre-wrap leading-relaxed shadow-inner">
              {result.summary}
            </div>
          </div>
        </div>
      ) : null}


        {hasDetails && (
          <div className="flex flex-col gap-6">
            {/* Case Tabs */}
            <div className="flex flex-wrap gap-2 pt-1">
              {details.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setActiveCaseId(entry.id)}
                  className={`group relative flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-bold transition-all border ${
                    activeCaseId === entry.id
                      ? "bg-[var(--bg-overlay)] text-[var(--text-primary)] border-[color:var(--border)] shadow-sm"
                      : "bg-transparent text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <div className={`h-2 w-2 rounded-full transition-shadow ${entry.passed ? "bg-[var(--success)]" : "bg-[var(--error)] shadow-[0_0_8px] shadow-[var(--error)]/50"}`} />
                  {entry.label}
                </button>
              ))}
            </div>

            {/* Selected Case Content */}
            {activeCase && (
              <div className="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-200 pb-10">
                <CodeBlock label="Input" value={activeCase.input} />
                
                {/* Error handling */}
                {activeCase.error ? (
                    <div className="mt-6 flex flex-col gap-2">
                        <div className="text-[12px] font-bold text-[var(--error)] uppercase tracking-tight">Xatolik (Error)</div>
                        <div className="rounded-[var(--radius-sm)] border border-[color:var(--error)]/30 bg-[var(--error)]/5 p-4 font-mono text-[13px] text-[var(--error)] leading-relaxed whitespace-pre-wrap italic shadow-inner">
                            {activeCase.error}
                        </div>
                    </div>
                ) : (
                    <>
                        <CodeBlock 
                            label="Natija (Output)" 
                            value={activeCase.actual} 
                            placeholder="Natija mavjud emas" 
                            highlight={!activeCase.passed}
                        />
                        <CodeBlock 
                            label="Kutilgan (Expected)" 
                            value={activeCase.expected} 
                        />
                    </>
                )}
                
                {/* Individual per-case metrics if available */}
                {(activeCase.runtime || activeCase.memory) && (
                    <div className="mt-8 flex gap-5 text-[12px] text-[var(--text-muted)] border-t border-[color:var(--border)]/50 pt-5">
                        {activeCase.runtime && <span>Sur’at: <span className="font-mono text-[var(--text-secondary)]">{activeCase.runtime}</span></span>}
                        {activeCase.memory && <span>Xotira: <span className="font-mono text-[var(--text-secondary)]">{activeCase.memory}</span></span>}
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
