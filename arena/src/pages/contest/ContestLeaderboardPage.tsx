import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import { contestService, type ContestDetail, type ContestLeaderboardRow } from "../../services/contestService";

export default function ContestLeaderboardPage() {
  const { id = "" } = useParams();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<ContestLeaderboardRow[]>([]);
  const [contest, setContest] = useState<ContestDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const [contestPayload, leaderboard] = await Promise.all([contestService.get(id), contestService.leaderboard(id)]);
        if (!cancelled) {
          setContest(contestPayload);
          setRows(leaderboard || []);
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
      title="Leaderboard"
      subtitle={contest ? `${contest.title} | ${contest.status} | ${contest.problems.length} problems` : `Contest: ${id}`}
    >
      {status === "loading" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Loading leaderboard...</div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">
          Failed to load contest leaderboard.
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Solved</th>
                  <th className="px-4 py-3">Penalty</th>
                </tr>
              </thead>
              <tbody className="text-sm text-arena-text">
                {rows.map((row, index) => (
                  <tr key={`${row.username}-${index}`} className="border-t border-white/5">
                    <td className="px-4 py-3 text-arena-muted">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.username}</td>
                    <td className="px-4 py-3 text-arena-muted">{row.solved}</td>
                    <td className="px-4 py-3 text-arena-muted">{row.penalty_minutes}</td>
                  </tr>
                ))}

                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-arena-muted" colSpan={4}>
                      Leaderboard will appear after the first scored submission.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
