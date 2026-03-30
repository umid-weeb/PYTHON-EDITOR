import React from 'react';

interface TimeoutWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const TimeoutWarningModal: React.FC<TimeoutWarningModalProps> = ({ isOpen, onClose, onContinue }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[9998] transition-opacity duration-300"
      />
      
      {/* Modal Content */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999] pointer-events-none">
        <div className="w-full max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-slate-700/30 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto transition-all duration-300 transform scale-100 opacity-100">
          <div className="p-8">
            {/* Header Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full" />
                <div className="relative bg-amber-100 dark:bg-amber-500/20 p-4 rounded-2xl">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-amber-600 dark:text-amber-400 stroke-2 fill-none stroke-current">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Title & Description */}
            <div className="text-center space-y-3 mb-8">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                Vaqt chegarasi tugadi
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Sizning kodingiz kutilganidan uzoqroq vaqt davomida ishlamoqda. Bu cheksiz sikl yoki juda katta hajmdagi xisob-kitoblar tufayli bo'lishi mumkin.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/50 dark:border-amber-500/20 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-400">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-2 fill-none stroke-current">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                Boshqaruvni o'zingizga oling
              </div>
            </div>

            {/* Question */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl mb-8 border border-slate-200 dark:border-slate-700/50 text-center">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Kodni yana bir bor uzunroq vaqt (5s) bilan tekshirib ko'ramizmi?
              </span>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={onContinue}
                className="flex items-center justify-center gap-2 w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/20 group"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current stroke-3 transition-transform group-hover:scale-110">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Ha, davom etsin
              </button>
              <button
                onClick={onClose}
                className="flex items-center justify-center gap-2 w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-3 fill-none stroke-current">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Yo'q, to'xtat
              </button>
            </div>
          </div>
          
          {/* Decorative Footer */}
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-30" />
        </div>
      </div>
    </>
  );
};

export default TimeoutWarningModal;
