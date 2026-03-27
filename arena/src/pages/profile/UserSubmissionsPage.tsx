import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardShell from "../../components/layout/DashboardShell.jsx";
import { formatMemory, formatRuntime } from "../../lib/formatters.js";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  getMySubmissions,
  getPublicProfile,
  getUserSubmissionsById,
  hydrateSubmissionRows,
  resolveSubmissionOutcome,
  type SubmissionRow,
} from "../../services/profileService";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function UserSubmissionsPage() {
  const { username = "" } = useParams();
  const { user } = useAuth();
  const isOwn = user?.username === username;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<SubmissionRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const items = isOwn
          ? await getMySubmissions()
          : await getPublicProfile(username).then((profile) => getUserSubmissionsById(profile.id));

        if (!cancelled) {
          setRows(await hydrateSubmissionRows(items || []));
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOwn, username]);

  const body = useMemo(() => {
    if (status === "loading") {
      return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Loading submissions...</div>;
    }
    if (status === "error") {
      return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">Failed to load submissions.</div>;
    }
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-arena-muted">
          {isOwn ? "No submissions yet." : "This user has no recorded submissions yet."}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-[840px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-arena-muted">
                <th className="px-4 py-3">Problem</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Runtime</th>
                <th className="px-4 py-3">Memory</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="text-sm text-arena-text">
              {rows.map((submission, index) => {
                const normalizedVerdict = resolveSubmissionOutcome(submission);
                const verdict = String(submission.verdict || submission.status || "--");
                const tone = normalizedVerdict.includes("accepted")
                  ? "text-emerald-300"
                  : normalizedVerdict.includes("wrong") || normalizedVerdict.includes("error")
                    ? "text-rose-300"
                    : "text-arena-muted";

                return (
                  <tr key={`${submission.problem_id}-${index}`} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      {submission.problem_slug ? (
                        <Link
                          className="font-medium text-arena-text hover:text-arena-primaryStrong"
                          to={`/problems/${encodeURIComponent(submission.problem_slug)}`}
                        >
                          {submission.problem_title || submission.problem_slug}
                        </Link>
                      ) : (
                        <div className="font-medium">{submission.problem_title || submission.problem_id}</div>
                      )}
                      <div className="mt-1 text-xs text-arena-muted">{submission.problem_slug || submission.problem_id}</div>
                    </td>
                    <td className="px-4 py-3 text-arena-muted">{submission.language || "--"}</td>
                    <td className={cx("px-4 py-3 font-medium", tone)}>{verdict}</td>
                    <td className="px-4 py-3 text-arena-muted">{formatRuntime(submission.runtime_ms)}</td>
                    <td className="px-4 py-3 text-arena-muted">{formatMemory(submission.memory_kb)}</td>
                    <td className="px-4 py-3 text-arena-muted">
                      {submission.created_at ? new Date(submission.created_at).toLocaleString() : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [isOwn, rows, status]);

  return (
    <DashboardShell eyebrow="Profile" title="Submissions" subtitle={`@${username}`}>
      {body}
    </DashboardShell>
  );
}
