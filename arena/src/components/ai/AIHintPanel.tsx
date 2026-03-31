import { useState } from "react";
import { aiApi } from "../../lib/apiClient";

type Props = {
  problemId: string;
  code: string;
  language: string;
};

export default function AIHintPanel({ problemId, code, language }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestHint = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiApi.getHint({
        code,
        problem_slug: problemId,
        language
      });
      setHint(data.hint);
    } catch (err: any) {
      console.error("AI Hint failed:", err);
      setError(err.message || "Shama yaratishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p className="animate-pulse text-sm text-gray-400">🤖 AI shama tayyorlamoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="text-3xl text-red-500">⚠️</div>
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={handleRequestHint}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-600"
        >
          Qayta urinish
        </button>
      </div>
    );
  }

  if (hint) {
    return (
      <div className="h-full overflow-y-auto p-4 font-sans">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <h3 className="flex items-center gap-2.5 text-sm font-bold text-indigo-300">
            <span className="text-xl">🤖</span> AI Shama (Hint)
          </h3>
        </div>

        <div className="rounded-xl border border-indigo-500/10 bg-white/5 p-6 shadow-sm">
          <p className="text-sm leading-relaxed text-gray-200 italic">
            "{hint}"
          </p>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => setHint(null)}
            className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-indigo-400 transition"
          >
            Yangi shama so'rash
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-6 p-8 text-center">
      <div className="text-5xl opacity-50">🤖</div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-base font-bold text-gray-200">AI Ustoz (Tutor)</h3>
        <p className="text-xs text-gray-400">
          Agar masalani echishda qiynalayotgan bo'lsangiz, AI Ustozdan shama (hint) so'rashingiz mumkin.
        </p>
      </div>
      <button
        onClick={handleRequestHint}
        className="rounded-lg bg-indigo-500 px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-indigo-600 active:scale-95"
      >
        Shama (Hint) so'rash
      </button>
    </div>
  );
}
