import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "../providers/ThemeProvider.tsx";
import TimeoutWarningModal from "../components/common/TimeoutWarningModal.tsx";

const DEFAULT_CODE = `# Onlayn Python muharriri
# Bu yerda kod yozishingiz va natijani ko'rishingiz mumkin

print("Salom, Pyzone!")

for i in range(5):
    print(f"Qadam: {i}")
`;

export default function OnlineEditorPage() {
  const { theme } = useTheme();
  const [code, setCode] = useState(() => {
    return localStorage.getItem("pyzone-online-editor-code") || DEFAULT_CODE;
  });
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isTimeoutModalOpen, setIsTimeoutModalOpen] = useState(false);
  
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    
    // Create worker using Vite's worker import syntax
    const worker = new Worker(new URL('../lib/pyodide.worker.js', import.meta.url));
    
    worker.onmessage = (e) => {
      const { type, stdout, stderr, error } = e.data;
      
      if (type === "initialized") {
        setIsLoading(false);
      } else if (type === "success") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setOutput(stdout || "Dastur muvaffaqiyatli yakunlandi.");
        setIsRunning(false);
      } else if (type === "error") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setOutput(error);
        setIsRunning(false);
      } else if (type === "init_error") {
        setIsLoading(false);
        setOutput("Xatolik: Python muhitini yuklab bo'lmadi: " + error);
      }
    };

    workerRef.current = worker;
    worker.postMessage({ type: "init" });
  }, []);

  useEffect(() => {
    initWorker();
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [initWorker]);

  useEffect(() => {
    localStorage.setItem("pyzone-online-editor-code", code);
  }, [code]);

  const handleRun = (isExtended = false) => {
    if (!workerRef.current || isRunning) return;

    setIsRunning(true);
    setIsTimeoutModalOpen(false);
    setOutput("Ishga tushirilmoqda...\n");

    const timeLimit = isExtended ? 5000 : 2000;

    // Send execution request to worker
    workerRef.current.postMessage({ type: "run", code });

    // Set timeout in main thread
    timeoutRef.current = setTimeout(() => {
      if (isRunning) {
        setIsRunning(false);
        setIsTimeoutModalOpen(true);
        
        // Terminate and restart worker to clear the hang
        initWorker();
      }
    }, timeLimit);
  };

  function handleClear() {
    setOutput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--h-navbar))] overflow-hidden bg-[var(--bg-base)]">
      {/* Toolbar */}
      <div className="flex h-[var(--h-toolbar)] shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[var(--bg-surface)] px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-[14px] font-bold text-[var(--text-primary)]">Onlayn Python Muharriri</h1>
          {isLoading && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              Python yuklanmoqda...
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRun(false)}
            disabled={isLoading || isRunning}
            className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] bg-[var(--success)] px-4 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {isRunning ? "Bajarilmoqda..." : "Ishga tushirish"}
          </button>
          <button
            onClick={handleClear}
            className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)]"
          >
            Tozalash
          </button>
        </div>
      </div>

      {/* Main Content (Split View) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col border-r border-[color:var(--border)]">
          <Editor
            height="100%"
            language="python"
            value={code}
            onChange={(val) => setCode(val || "")}
            theme={theme === "dark" ? "vs-dark" : "vs"}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              padding: { top: 16 },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        {/* Output Area */}
        <div className="w-[40%] flex flex-col bg-[var(--bg-surface)]">
          <div className="flex h-[32px] shrink-0 items-center px-4 border-b border-[color:var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Natija (Output)
          </div>
          <div className="flex-1 overflow-auto p-4 font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-[var(--text-primary)]">
            {output || (
              <span className="text-[var(--text-muted)] italic">
                Natija bu yerda ko'rinadi...
              </span>
            )}
          </div>
        </div>
      </div>

      <TimeoutWarningModal
        isOpen={isTimeoutModalOpen}
        onClose={() => setIsTimeoutModalOpen(false)}
        onContinue={() => handleRun(true)}
      />
    </div>
  );
}
