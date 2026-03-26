import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import { contestService, type ContestDetail } from "../../services/contestService";

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  const startLabel = startsAt ? new Date(startsAt).toLocaleString() : "--";
  const endLabel = endsAt ? new Date(endsAt).toLocaleString() : "--";
  return `${startLabel} to ${endLabel}`;
}

function statusClasses(status?: string | null) {
  if (status === "running") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "upcoming") return "border-sky-400/20 bg-sky-500/10 text-sky-300";
  return "border-white/10 bg-white/5 text-arena-muted";
}

function buildSubtitle(contest: ContestDetail | null) {
  if (!contest) return "Contest details, schedule, problems, and standings.";
  const problemCount = contest.problems.length;
  return `${problemCount} problem${problemCount === 1 ? "" : "s"} | ${contest.status} contest`;
}

export default function ContestPage() {
  const { id = "" } = useParams();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [contest, setContest] = useState<ContestDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const data = await contestService.get(id);
        if (!cancelled) {
          setContest(data);
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
  }, [id]);

  return (
    <DashboardShell
      eyebrow="Contest"
      title={contest?.title || "Contest"}
      subtitle={buildSubtitle(contest)}
      actions={
        <Link
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-arena-text hover:bg-white/10"
          to={`/contest/${encodeURIComponent(id)}/leaderboard`}
        >
          Open leaderboard
        </Link>
      }
    >
      {status === "loading" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Loading contest...</div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Contest not found.</div>
      ) : null}

      {status === "ready" && contest ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Status</div>
              <div className="mt-3">
                <span
                  className={[
                    "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
                    statusClasses(contest.status),
                  ].join(" ")}
                >
                  {contest.status}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Schedule</div>
              <div className="mt-3 text-sm text-arena-text">{formatDateRange(contest.starts_at, contest.ends_at)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">Problems</div>
              <div className="mt-3 text-3xl font-bold text-arena-text">{contest.problems.length}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-arena-text">Overview</div>
            <div className="mt-3 text-sm text-arena-text/90">
              {contest.description || "This contest is live in the Arena schedule. Problem order, timings, and leaderboard below use real contest data."}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-arena-text">Problems</div>
            <div className="mt-3 space-y-2">
              {contest.problems.length === 0 ? (
                <div className="text-sm text-arena-muted">No problems have been attached to this contest yet.</div>
              ) : null}

              {contest.problems.map((problem) => (
                <Link
                  key={problem.problem_slug}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 hover:bg-white/10"
                  to={`/problems/${encodeURIComponent(problem.problem_slug)}?contest=${encodeURIComponent(id)}`}
                >
                  <div className="text-sm font-medium text-arena-text">{problem.title || problem.problem_slug}</div>
                  <div className="text-xs text-arena-muted">{problem.difficulty || "--"}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
