import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { arenaApi } from "../../lib/apiClient";
import { useTheme } from "../../providers/ThemeProvider.tsx";

type Solution = {
  id: number;
  username: string;
  code: string;
  language: string;
  runtime: number;
  memory: number;
  created_at: string;
};

type Props = {
  problemId: string;
};

export default function SolutionsPanel({ problemId }: Props) {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const fetchSolutions = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await arenaApi.getSolutions(problemId);
        setSolutions(data);
        if (data.length > 0) {
          setSelectedSolution(data[0]);
        }
      } catch (err: any) {
        console.error("Failed to fetch solutions:", err);
        setError(err.message || "Yechimlarni yuklashda xatolik yuz berdi.");
      } finally {
        setLoading(false);
      }
    };

    if (problemId) {
      fetchSolutions();
    }
  }, [problemId]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p className="animate-pulse text-sm text-gray-400">Yechimlar yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center text-[var(--text-secondary)]">
        <div className="text-3xl">🔒</div>
        <p className="max-w-xs text-sm">
          {error.includes("403") 
            ? "Yechimlarni ko'rish uchun avval masalani o'zingiz yechishingiz kerak." 
            : error}
        </p>
      </div>
    );
  }

  if (solutions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-gray-500">
        <p className="text-sm">Hozircha boshqa yechimlar yo'q.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-surface)] md:flex-row">
      {/* Sidebar - List of Users */}
      <div className="w-full shrink-0 border-r border-[color:var(--border)] md:w-64 overflow-y-auto">
        <div className="divide-y divide-[color:var(--border)]">
          {solutions.map((sol) => (
            <button
              key={sol.id}
              onClick={() => setSelectedSolution(sol)}
              className={[
                "w-full px-4 py-3 text-left transition hover:bg-[var(--bg-overlay)]",
                selectedSolution?.id === sol.id ? "bg-indigo-500/10 border-l-2 border-indigo-500" : "bg-transparent"
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text-primary)]">@{sol.username}</span>
                <span className="text-[10px] text-[var(--text-muted)] uppercase">{sol.language}</span>
              </div>
              <div className="mt-1 flex gap-2 text-[10px] text-gray-500">
                <span>⏱ {sol.runtime}ms</span>
                <span>💾 {Math.round(sol.memory / 1024)}MB</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Code View */}
      <div className="relative flex-1 overflow-hidden h-full">
        {selectedSolution && (
          <Editor
            height="100%"
            language={selectedSolution.language === "cpp" ? "cpp" : selectedSolution.language}
            theme={theme === "dark" ? "vs-dark" : "vs"}
            value={selectedSolution.code}
            options={{
              readOnly: true,
              automaticLayout: true,
              fontSize: 13,
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              domReadOnly: true,
              renderLineHighlight: "none",
              scrollbar: { vertical: "visible", horizontal: "visible" }
            }}
          />
        )}
      </div>
    </div>
  );
}
