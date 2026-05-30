import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Toast = {
  id: string;
  title?: string;
  message: string;
  type?: "info" | "success" | "error";
  timeout?: number;
};

type ToastContextValue = {
  push: (t: Omit<Toast, "id">) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: any }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = (t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((cur) => [...cur, { ...t, id }]);
  };

  const clear = () => setToasts([]);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => {
      const timeout = t.timeout ?? 4500;
      return setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
      }, timeout);
    });
    return () => timers.forEach((id) => clearTimeout(id));
  }, [toasts]);

  const value = useMemo(() => ({ push, clear }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container */}
      <div className="fixed right-4 top-16 z-50 flex w-[360px] max-w-full flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "rounded-lg border p-3 shadow-md",
              t.type === "success" ? "bg-emerald-700 border-emerald-600 text-white" : "",
              t.type === "error" ? "bg-red-700 border-red-600 text-white" : "",
              t.type === "info" ? "bg-[#0f1724] border-[color:var(--border)] text-[var(--text-primary)]" : "",
            ].join(" ")}
          >
            {t.title ? <div className="mb-1 font-semibold">{t.title}</div> : null}
            <div className="text-sm">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
