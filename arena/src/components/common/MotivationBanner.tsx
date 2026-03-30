import { useState, useEffect } from "react";
import { userApi } from "../../lib/apiClient.js";

/**
 * MotivationBanner - A Monkeytype-inspired minimalist notification/motivation component.
 * Displays personalized AI specialist messages in Uzbek for engagement.
 */
export default function MotivationBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchMotivation() {
      try {
        const data = await userApi.getMotivation();
        
        if (mounted && data?.message) {
          setMessage(data.message);
          // Small delay for a smooth entry
          setTimeout(() => setIsVisible(true), 100);
        }
      } catch (err) {
        // Silently fail for motivation messages to avoid UI noise
      }
    }

    fetchMotivation();
    return () => { mounted = false; };
  }, []);

  if (!message) return null;

  return (
    <div 
      className={`mx-auto w-full max-w-4xl px-4 transition-all duration-1000 ease-out transform ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="relative group overflow-hidden rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/40 p-5 transition-all hover:bg-white/80 dark:hover:bg-slate-900/50 hover:shadow-xl hover:shadow-emerald-500/5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5 select-none text-xl animate-pulse">
            💡
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed tracking-tight select-none italic">
              {message}
            </p>
          </div>
        </div>
        
        {/* Subtle decorative elements for that "premium" feel */}
        <div className="absolute top-2 right-2 w-1 h-1 rounded-full bg-emerald-500/20 group-hover:bg-emerald-500/60 transition-colors" />
        <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0 group-hover:w-full transition-all duration-1000" />
      </div>
    </div>
  );
}
