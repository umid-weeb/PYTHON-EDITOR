import { useState } from "react";
import TestCasePanel from "../results/TestCasePanel.jsx";
import ResultPanel from "../results/ResultPanel.jsx";

type VisibleTestcase = {
  name?: string;
  input?: string;
  expected_output?: string;
};

type Result = {
  tone?: string;
  chip?: string;
  summary?: string;
  details?: any[];
};

type Props = {
  cases: VisibleTestcase[];
  activeIndex: number;
  onSelect: (index: number) => void;
  result: Result;
  busy: boolean;
};

type Tab = "cases" | "result" | "console";

export default function TestTabs({ cases, activeIndex, onSelect, result, busy }: Props) {
  const [active, setActive] = useState<Tab>("cases");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-t border-[color:var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
      <div className="flex h-[var(--h-tab-bar)] shrink-0 items-center border-b border-[color:var(--border)] px-1">
        {[
          { key: "cases", label: "Testlar" },
          { key: "result", label: "Natija" },
          { key: "console", label: "Konsol" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={[
              "inline-flex h-full items-center border-b-2 px-3 text-[12px] transition",
              active === tab.key
                ? "border-[color:var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            ].join(" ")}
            type="button"
            onClick={() => setActive(tab.key as Tab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "cases" ? <TestCasePanel activeIndex={activeIndex} cases={cases} onSelect={onSelect} /> : null}
        {active === "result" ? <ResultPanel busy={busy} result={result} /> : null}
        {active === "console" ? (
          <div className="flex h-full flex-col overflow-auto p-[10px]">
            <div className="rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] p-3 text-[12px] text-[var(--text-secondary)]">
              {result?.summary || "Hozircha konsol chiqishi yo'q."}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
