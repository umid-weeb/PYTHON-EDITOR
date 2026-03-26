import ReactMarkdown from "react-markdown";

type VisibleTestcase = {
  name?: string;
  input?: string;
  expected_output?: string;
};

type Problem = {
  title?: string;
  id?: string;
  difficulty?: string;
  description?: string;
  constraints?: string[];
  visible_testcases?: VisibleTestcase[];
};

type Props = {
  problem: Problem | null;
  loading: boolean;
};

function difficultyStyles(difficulty?: string) {
  const value = String(difficulty || "").toLowerCase();
  if (value === "easy") return "bg-[var(--easy-bg)] text-[var(--easy)]";
  if (value === "medium") return "bg-[var(--medium-bg)] text-[var(--medium)]";
  if (value === "hard") return "bg-[var(--hard-bg)] text-[var(--hard)]";
  return "bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
}

export default function ProblemDescription({ problem, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-6 w-2/3 rounded-[var(--radius-xs)] bg-[var(--bg-overlay)]" />
        <div className="h-3 w-11/12 rounded-[var(--radius-xs)] bg-[var(--bg-overlay)]" />
        <div className="h-24 rounded-[var(--radius-xs)] bg-[var(--bg-overlay)]" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-[var(--text-secondary)]">
        Select a problem to see the description.
      </div>
    );
  }

  const examples = (problem.visible_testcases || []).slice(0, 3);

  return (
    <div className="flex h-full min-h-0 flex-col border border-[color:var(--border)] bg-[var(--bg-surface)]">
      <div className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/95 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-3">
          <span
            className={[
              "inline-flex h-[var(--h-badge)] items-center rounded-[var(--radius-xs)] px-2 text-[11px] font-semibold uppercase tracking-[0.05em]",
              difficultyStyles(problem.difficulty),
            ].join(" ")}
          >
            {String(problem.difficulty || "Unknown")}
          </span>
          <h1 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {problem.title || problem.id || "Untitled problem"}
          </h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-4">
          <div className="space-y-3 text-[13px] leading-6 text-[var(--text-secondary)]">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">{children}</h2>,
                h2: ({ children }) => <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">{children}</h3>,
                h3: ({ children }) => <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{children}</h4>,
                p: ({ children }) => <p>{children}</p>,
                ul: ({ children }) => <ul className="space-y-1 pl-4">{children}</ul>,
                ol: ({ children }) => <ol className="space-y-1 pl-4">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                code: ({ children }) => (
                  <code className="rounded-[var(--radius-xs)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[12px] text-[var(--text-primary)]">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="overflow-x-auto rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3 text-[12px] text-[var(--text-primary)]">
                    {children}
                  </pre>
                ),
              }}
            >
              {problem.description || "No description available."}
            </ReactMarkdown>
          </div>

          {problem.constraints && problem.constraints.length > 0 ? (
            <section className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Constraints</div>
              <ul className="space-y-1 pl-4 text-[13px] text-[var(--text-secondary)]">
                {problem.constraints.map((constraint, index) => (
                  <li key={index}>{constraint}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {examples.length > 0 ? (
            <section className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Examples</div>
              {examples.map((example, index) => (
                <div
                  key={index}
                  className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3"
                >
                  <div className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">Example {index + 1}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Input</div>
                      <pre className="m-0 whitespace-pre-wrap break-words text-[12px] text-[var(--text-primary)]">
                        {example.input || "--"}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Output</div>
                      <pre className="m-0 whitespace-pre-wrap break-words text-[12px] text-[var(--text-primary)]">
                        {example.expected_output || "--"}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
