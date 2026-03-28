import { useState } from "react";
import { aiApi } from "../../lib/apiClient";

type Props = {
  problemId: string;
  code: string;
  language: string;
};

export default function AIReviewPanel({ problemId, code, language }: Props) {
  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiApi.getReview({
        code,
        problem_slug: problemId,
        language
      });
      setReview(data);
    } catch (err: any) {
      console.error("AI Review failed:", err);
      setError(err.message || "AI analizida xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--accent)] border-t-transparent"></div>
        <p className="animate-pulse text-sm text-[var(--text-secondary)]">🤖 AI kodingizni analiz qilmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="text-3xl text-[var(--danger)]">⚠️</div>
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        <button
          onClick={handleReview}
          className="rounded-[var(--radius-xs)] bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)]"
        >
          Qayta urinish
        </button>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-6 p-8 text-center">
        <div className="text-5xl opacity-50">🤖</div>
        <div className="max-w-xs space-y-2">
          <h3 className="text-base font-bold text-[var(--text-primary)]">AI Code Review</h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Kodingizning murakkabligini, yashirin xatolarni va optimallashtirish yo'llarini bilib oling.
          </p>
        </div>
        <button
          onClick={handleReview}
          className="rounded-[var(--radius-xs)] bg-[var(--accent)] px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-[var(--accent-hover)] active:scale-95"
        >
          AI bilan analiz qilish
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-subtle)]/30 p-4 font-sans selection:bg-[var(--accent)]/20">
      {/* Header & Score */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/5 p-4 shadow-sm backdrop-blur-sm">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-[var(--text-primary)]">
          <span className="text-xl">🤖</span> AI Analiz Natijasi
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Umumiy Ball:</span>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[color:var(--accent)] bg-[var(--bg-surface)] text-lg font-black text-[var(--accent)]">
            {review.overall_score}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Complexity Section */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm transition hover:border-[color:var(--border-hover)]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">⏱ Vaqt Murakkabligi</div>
            <div className="mb-2 flex items-center gap-2 font-mono text-sm font-bold">
              <span className="text-[var(--danger)]">{review.time_complexity.detected}</span>
              <span className="text-[var(--text-muted)] opacity-50">→</span>
              <span className="text-[var(--success)]">{review.time_complexity.optimal}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{review.time_complexity.suggestion}</p>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm transition hover:border-[color:var(--border-hover)]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">💾 Xotira Murakkabligi</div>
            <div className="mb-2 font-mono text-sm font-bold text-[var(--accent)]">{review.space_complexity.detected}</div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{review.space_complexity.suggestion}</p>
          </div>
        </div>

        {/* Edge Cases & Code Style */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--danger)]/10 bg-[color:var(--danger)]/5 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--danger)]">
              <span>⚠️</span> Yashirin Holatlar (Edge Cases)
            </div>
            <ul className="space-y-2 list-inside list-disc pl-1">
              {review.edge_cases.map((caseStr: string, idx: number) => (
                <li key={idx} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {caseStr}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[color:var(--accent)]/10 bg-[color:var(--accent)]/5 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
              <span>✨</span> Kod Stilini Yaxshilash
            </div>
            <ul className="space-y-2 list-inside list-disc pl-1">
              {review.code_style.map((style: string, idx: number) => (
                <li key={idx} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {style}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Alternative Approach */}
        {review.alternative && (
          <div className="rounded-xl border border-[color:var(--success)]/10 bg-[color:var(--success)]/5 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--success)]">
              <span>💡</span> Muqobil Yondashuv
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--text-primary)]">
              {review.alternative}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={() => setReview(null)}
          className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] transition"
        >
          Yangi analiz qilish
        </button>
      </div>
    </div>
  );
}
