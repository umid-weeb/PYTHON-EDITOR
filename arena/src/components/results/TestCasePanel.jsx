export default function TestCasePanel({ cases = [], activeIndex, onSelect }) {
  if (!cases.length) {
    return (
      <div className="flex h-full min-h-0 min-w-0 items-center justify-center px-4 text-center text-[12px] text-[var(--text-secondary)]">
        Select a problem to inspect the visible test cases.
      </div>
    );
  }

  const activeCase = cases[activeIndex] || cases[0];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto p-[10px] pb-0">
        {cases.map((testCase, index) => (
          <button
            key={`${testCase.input}-${index}`}
            className={[
              "h-[var(--h-badge)] shrink-0 rounded-[var(--radius-xs)] border px-2 text-[11px] font-medium transition",
              activeIndex === index
                ? "border-[color:var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                : "border-[color:var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]",
            ].join(" ")}
            type="button"
            onClick={() => onSelect(index)}
          >
            Case {index + 1}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-[10px]">
        <section className="rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Input</div>
          <pre className="m-0 whitespace-pre-wrap break-words text-[12px] text-[var(--text-primary)]">
            {activeCase.input || "No input"}
          </pre>
        </section>
        <section className="rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Expected Output</div>
          <pre className="m-0 whitespace-pre-wrap break-words text-[12px] text-[var(--text-primary)]">
            {activeCase.expected_output || "No expected output"}
          </pre>
        </section>
      </div>
    </div>
  );
}
