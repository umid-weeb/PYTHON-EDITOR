import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "../providers/ThemeProvider.tsx";

const DEFAULT_CODE = `# Onlayn Python muharriri
# Bu yerda kod yozishingiz va natijani ko'rishingiz mumkin

print("Salom, Pyzone!")

for i in range(5):
    print(f"Qadam: {i}")
`;

const PYTHON_HARNESS = `
import sys
import time
import traceback
import builtins
from io import StringIO

class LoopIterationError(Exception): pass

def _tick():
    if time.time() - _start_time > 2.0:
        raise LoopIterationError("Vaqt chegarasi tugadi (2s). Cheksiz sikl bo'lishi mumkin.")

_start_time = time.time()

def safe_run(code):
    global _start_time
    _start_time = time.time()
    
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = sys.stderr = StringIO()
    
    try:
        # In a real environmental, we would use AST to inject _tick() 
        # but for this browser version we'll keep it simpler for now
        glbs = {"__builtins__": builtins, "__name__": "__main__"}
        exec(code, glbs)
        return {"success": True, "output": sys.stdout.getvalue()}
    except Exception as e:
        return {
            "success": False, 
            "output": sys.stdout.getvalue(),
            "error": traceback.format_exc()
        }
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
`;

export default function OnlineEditorPage() {
  const { theme } = useTheme();
  const [code, setCode] = useState(() => {
    return localStorage.getItem("pyzone-online-editor-code") || DEFAULT_CODE;
  });
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const pyodideRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!window.loadPyodide) {
        setOutput("Xatolik: Pyodide scripti topilmadi. Sahifani yangilang.");
        return;
      }

      try {
        const py = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/",
        });
        if (!mounted) return;
        
        await py.runPythonAsync(PYTHON_HARNESS);
        pyodideRef.current = py;
        setIsLoading(false);
      } catch (err) {
        if (mounted) {
          setOutput("Xatolik: Python muhitini yuklab bo'lmadi: " + err.message);
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem("pyzone-online-editor-code", code);
  }, [code]);

  async function handleRun() {
    if (!pyodideRef.current || isRunning) return;

    setIsRunning(true);
    setOutput("Ishga tushirilmoqda...\n");

    try {
      const wrappedCode = JSON.stringify(code);
      const resultJson = await pyodideRef.current.runPythonAsync(
        `import json; json.dumps(safe_run(${wrappedCode}))`
      );
      const result = JSON.parse(resultJson);

      if (result.success) {
        setOutput(result.output || "Dastur muvaffaqiyatli yakunlandi (chiqish oqimi bo'sh).");
      } else {
        setOutput((result.output ? result.output + "\n" : "") + result.error);
      }
    } catch (err) {
      setOutput("Bajarishda xatolik: " + err.message);
    } finally {
      setIsRunning(false);
    }
  }

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
            onClick={handleRun}
            disabled={isLoading || isRunning}
            className="inline-flex h-[var(--h-btn-md)] items-center rounded-[var(--radius-xs)] bg-[var(--success)] px-4 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {isRunning ? "Ishlayapti..." : "Ishga tushirish"}
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
    </div>
  );
}
