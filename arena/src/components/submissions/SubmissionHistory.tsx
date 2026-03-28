import { useEffect, useState } from "react";
import { userApi } from "../../lib/apiClient.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatRuntime, formatMemory, localizeVerdictLabel } from "../../lib/formatters.js";

type Submission = {
  id: string;
  problem_id: string;
  problem_slug: string;
  verdict: string;
  status: string;
  runtime_ms: number | null;
  memory_kb: number | null;
  created_at: string;
};

type Props = {
  problemId: string;
  lastSubmissionId?: string | null;
  onViewSubmission?: (id: string) => void;
};

export default function SubmissionHistory({ problemId, lastSubmissionId, onViewSubmission }: Props) {
  const { token } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const data = await userApi.getSubmissions();
        const items = (Array.isArray(data) ? data : data?.items || []) as Submission[];
        
        // Filter for this problem only
        const filtered = items.filter(s => 
          s.problem_id === problemId || 
          s.problem_slug === problemId
        );
        
        setSubmissions(filtered.slice(0, 10));
      } catch (err) {
        console.error("Failed to load submissions:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, problemId, lastSubmissionId]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-[var(--text-secondary)]">
        Tarixni ko'rish uchun tizimga kiring.
      </div>
    );
  }

  if (loading && submissions.length === 0) {
    return (
        <div className="flex flex-col gap-2 p-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="h-10 animate-pulse rounded-[var(--radius-xs)] bg-[var(--bg-overlay)]" />
            ))}
        </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-[var(--text-secondary)]">
        Hozircha urinishlar mavjud emas.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-[var(--bg-surface)] text-[var(--text-muted)]">
          <tr>
            <th className="px-4 py-2 font-medium">Holat</th>
            <th className="px-4 py-2 font-medium">Vaqt</th>
            <th className="px-4 py-2 font-medium">Xotira</th>
            <th className="hidden px-4 py-2 font-medium md:table-cell">Sana</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--border)]">
          {submissions.map((s) => {
            const verdict = s.verdict || s.status;
            const isAccepted = String(verdict).toLowerCase().includes("accepted");
            return (
              <tr 
                key={s.id} 
                className="cursor-pointer hover:bg-[var(--bg-overlay)]"
                onClick={() => onViewSubmission?.(s.id)}
              >
                <td className={`px-4 py-2.5 font-semibold ${isAccepted ? "text-[var(--easy)]" : "text-[var(--hard)]"}`}>
                  {localizeVerdictLabel(verdict)}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {formatRuntime(s.runtime_ms)}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {formatMemory(s.memory_kb)}
                </td>
                <td className="hidden px-4 py-2.5 text-[var(--text-muted)] md:table-cell">
                  {new Date(s.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
