function Spinner() {
  return (
    <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
  );
}

function statusTone(tone) {
  if (tone === "success") return "text-[var(--success)]";
  if (tone === "danger") return "text-[var(--error)]";
  if (tone === "warning") return "text-[var(--warning)]";
  return "text-[var(--text-primary)]";
}

export default function ResultPanel({ result, busy = false }) {
  const details = Array.isArray(result?.details) ? result.details : [];
  const hasDetails = details.length > 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-surface)]">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-[10px]">
        <div className="flex items-center gap-3">
          <span className={["text-[14px] font-semibold", statusTone(result?.tone)].join(" ")}>
            {result?.chip || "Result"}
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">{result?.summary || "Run or submit to see the verdict."}</span>
          {busy ? <Spinner /> : null}
        </div>

        {busy && !hasDetails ? (
          <div className="rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
            Waiting for the judge to finish execution...
          </div>
        ) : null}

        {hasDetails ? (
          <div className="flex flex-col gap-1">
            {details.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 py-[6px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{entry.label}</div>
                  <div className="truncate text-[11px] text-[var(--text-secondary)]">{entry.verdict}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-[var(--text-muted)]">
                  {entry.runtime ? <div>{entry.runtime}</div> : null}
                  {entry.memory ? <div>{entry.memory}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : !busy ? (
          <div className="text-[12px] text-[var(--text-secondary)]">
            Run or submit a solution to inspect each test result.
          </div>
        ) : null}
      </div>
    </div>
  );
}
