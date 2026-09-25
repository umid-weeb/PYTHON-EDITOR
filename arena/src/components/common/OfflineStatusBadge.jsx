import React, { useState, useEffect } from "react";

export default function OfflineStatusBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Network Status Badge */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border transition-colors ${
          isOnline
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            : "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
        }`}
        title={
          isOnline
            ? "PyZone internetga ulangan. Barcha resurslar oflayn ishlash uchun keshlandi."
            : "Internet aloqasi yo'q. PyZone 100% oflayn rejimda ishlamoqda!"
        }
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
          }`}
        />
        <span>{isOnline ? "Oflayn rejim tayyor" : "Internetsiz rejim"}</span>
      </div>

      {/* PWA Install Button */}
      {deferredPrompt && !isInstalled && (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium shadow-sm transition-all text-xs border border-indigo-400/30 active:scale-95"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span>App-ni o'rnatish</span>
        </button>
      )}
    </div>
  );
}
