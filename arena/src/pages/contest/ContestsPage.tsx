import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import { contestApi } from "../../lib/apiClient.js";
import type { ContestListItem } from "../../services/contestService";

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  const startLabel = startsAt ? new Date(startsAt).toLocaleString() : "--";
  const endLabel = endsAt ? new Date(endsAt).toLocaleString() : "--";
  return `${startLabel} to ${endLabel}`;
}

function statusClasses(status: ContestListItem["status"]) {
  if (status === "running") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "upcoming") return "border-sky-400/20 bg-sky-500/10 text-sky-400";
  return "border-[var(--arena-border)] bg-[var(--arena-surface-soft)] text-arena-muted";
}

export default function ContestsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<ContestListItem[]>([]);

  const summary = useMemo(() => {
    const running = items.filter((item) => item.status === "running").length;
    const upcoming = items.filter((item) => item.status === "upcoming").length;
    const finished = items.filter((item) => item.status === "finished").length;
    return { running, upcoming, finished };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const data = await contestApi.list();
        if (!cancelled) {
          setItems(data || []);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardShell eyebrow="Competition" title="Contests" subtitle="Timed rounds, curated problem sets, live scoreboard.">
      {status === "loading" ? (
        <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 text-arena-muted backdrop-blur-md shadow-[var(--arena-shadow)]">Loading contests...</div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 text-arena-muted backdrop-blur-md shadow-[var(--arena-shadow)]">
          Could not load contests right now. Check the API deployment or try again in a moment.
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-3">
          {items.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-5 backdrop-blur-md shadow-[var(--arena-shadow)]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Running</div>
                <div className="mt-2 text-3xl font-bold text-arena-text">{summary.running}</div>
              </div>
              <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-5 backdrop-blur-md shadow-[var(--arena-shadow)]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Upcoming</div>
                <div className="mt-2 text-3xl font-bold text-arena-text">{summary.upcoming}</div>
              </div>
              <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-5 backdrop-blur-md shadow-[var(--arena-shadow)]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Finished</div>
                <div className="mt-2 text-3xl font-bold text-arena-text">{summary.finished}</div>
              </div>
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 text-arena-muted backdrop-blur-md shadow-[var(--arena-shadow)]">
              No contests have been scheduled yet.
            </div>
          ) : null}

          {items.map((contest) => (
            <Link
              key={contest.id}
              to={`/contest/${encodeURIComponent(contest.id)}`}
              className="block rounded-2xl border border-[var(--arena-border)] bg-[var(--arena-surface)] p-6 transition hover:bg-[var(--arena-surface-soft)] backdrop-blur-md shadow-[var(--arena-shadow)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-arena-text">{contest.title}</div>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                        statusClasses(contest.status),
                      ].join(" ")}
                    >
                      {contest.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-arena-muted">{formatDateRange(contest.starts_at, contest.ends_at)}</div>
                </div>
                <div className="text-sm font-medium text-arena-text">Open contest</div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
