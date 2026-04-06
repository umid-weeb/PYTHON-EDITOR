import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { aiApi } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";

// --------------------------------------------------------------------------- //
//  Types                                                                        //
// --------------------------------------------------------------------------- //
type Role = "user" | "bot";

type Message = {
  id: string;
  text: string;
  sender: Role;
  timestamp: Date;
};

type HistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  problemId: string;
  problemTitle: string;
  code: string;
  language: string;
};

// localStorage key for guest request count
const GUEST_COUNT_KEY = "ai_chat_guest_count";
const GUEST_LIMIT = 5;

function getGuestCount(): number {
  try {
    return parseInt(localStorage.getItem(GUEST_COUNT_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

function incrementGuestCount(): number {
  const next = getGuestCount() + 1;
  try {
    localStorage.setItem(GUEST_COUNT_KEY, String(next));
  } catch {}
  return next;
}

// --------------------------------------------------------------------------- //
//  Component                                                                    //
// --------------------------------------------------------------------------- //
export default function AIChatBot({ problemId, problemTitle, code, language }: Props) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const welcomeText = problemTitle
    ? `Assalomu alaykum! Men sizning AI Ustozi-ingizman. "${problemTitle}" masalasida qiynalayotgan bo'lsangiz, mendan so'rang — lekin kodni to'g'ridan-to'g'ri bermayman 😊`
    : `Assalomu alaykum! Men sizning AI Ustozi-ingizman. Masala bo'yicha savollaringizni bering — kodni to'g'ridan-to'g'ri bermayman, lekin yo'nalish ko'rsataman 😊`;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: welcomeText,
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep a parallel history array in the format the backend expects
  const historyRef = useRef<HistoryEntry[]>([]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const addMessage = (text: string, sender: Role): Message => {
    const msg: Message = {
      id: `${Date.now()}-${Math.random()}`,
      text,
      sender,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Optimistic: show user message immediately
    addMessage(trimmed, "user");
    setInput("");
    setLoading(true);

    // Guest pre-check: if they've already hit the limit locally, show prompt
    if (!isAuthenticated) {
      const guestCount = getGuestCount();
      if (guestCount >= GUEST_LIMIT) {
        setShowAuthPrompt(true);
        setLoading(false);
        return;
      }
    }

    try {
      const data = await aiApi.chat({
        code,
        problem_slug: problemId,
        language,
        user_message: trimmed,
        conversation_history: historyRef.current,
      });

      // Server says guest limit reached
      if (data.requires_auth) {
        setShowAuthPrompt(true);
        setLoading(false);
        return;
      }

      // Increment guest counter only after successful request
      if (!isAuthenticated) {
        incrementGuestCount();
      }

      if (data.remaining !== null && data.remaining !== undefined) {
        setRemaining(data.remaining);
      }

      const reply: string = data.reply ?? "Javob olishda xatolik yuz berdi.";
      addMessage(reply, "bot");

      // Update history for next turn (keep last 10 exchanges = 20 messages)
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: trimmed },
        { role: "assistant", content: reply },
      ].slice(-20);
    } catch (err: any) {
      addMessage(
        "Kechirasiz, texnik nosozlik yuz berdi. Bir ozdan so'ng qayta urining.",
        "bot"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // -------------------------------------------------------------------------- //
  //  Auth prompt overlay                                                         //
  // -------------------------------------------------------------------------- //
  const AuthPrompt = () => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#0f1117]/95 p-6 text-center backdrop-blur-sm">
      <div className="text-4xl">🔐</div>
      <p className="text-sm font-semibold text-white">
        Bepul {GUEST_LIMIT} ta so'rov tugadi
      </p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Davom etish uchun ro'yxatdan o'ting — ro'yxatdan o'tgan foydalanuvchilar kuniga{" "}
        <span className="text-indigo-400 font-semibold">300 ta</span> so'rov yuborishingiz mumkin.
      </p>
      <div className="flex w-full flex-col gap-2">
        <button
          onClick={() => navigate("/register")}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500"
        >
          Ro'yxatdan o'tish
        </button>
        <button
          onClick={() => navigate("/login")}
          className="w-full rounded-xl border border-white/10 py-2.5 text-xs text-gray-300 transition hover:bg-white/5"
        >
          Kirish (login)
        </button>
      </div>
      <button
        onClick={() => setShowAuthPrompt(false)}
        className="text-[10px] text-gray-600 hover:text-gray-400 underline"
      >
        Yopish
      </button>
    </div>
  );

  // -------------------------------------------------------------------------- //
  //  Remaining badge                                                             //
  // -------------------------------------------------------------------------- //
  const remainingLabel = () => {
    if (!isAuthenticated) {
      const used = getGuestCount();
      const left = Math.max(0, GUEST_LIMIT - used);
      return `${left}/${GUEST_LIMIT} bepul`;
    }
    if (remaining !== null) return `${remaining} qoldi`;
    return null;
  };

  const label = remainingLabel();

  // -------------------------------------------------------------------------- //
  //  Render                                                                      //
  // -------------------------------------------------------------------------- //
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">
      {/* -------------------------------------------------------------------- */}
      {/* Chat Window                                                            */}
      {/* -------------------------------------------------------------------- */}
      {isOpen && (
        <div className="pointer-events-auto relative mb-4 flex h-[500px] w-80 flex-col overflow-hidden rounded-2xl border border-indigo-500/20 bg-[#0f1117]/95 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          {showAuthPrompt && <AuthPrompt />}

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-indigo-600 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl backdrop-blur-md">
                🤖
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">AI Ustoz (Pyzone)</h3>
                <p className="text-[10px] opacity-80">
                  Algoritmlar bo'yicha maslahatchi
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {label && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium">
                  {label}
                </span>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 transition hover:bg-white/10"
                aria-label="Yopish"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4 scroll-smooth"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "bot" && (
                  <span className="mr-2 mt-1 shrink-0 text-base">🤖</span>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm ${
                    msg.sender === "user"
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <span className="mr-2 mt-1 shrink-0 text-base">🤖</span>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-3 shadow-sm">
                  <div className="flex gap-1.5 items-center px-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 p-4 bg-black/20 border-t border-white/5">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                placeholder="Savol yozing yoki shama so'rang..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || showAuthPrompt}
                maxLength={500}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading || showAuthPrompt}
                className="absolute right-2 p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40"
                aria-label="Yuborish"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-center text-gray-500">
              ⚠️ AI kodni to'liq holda yozib bermaydi • Faqat algoritmlar
            </p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Toggle Button                                                          */}
      {/* -------------------------------------------------------------------- */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:shadow-indigo-500/20 active:scale-95 group relative overflow-hidden"
        aria-label={isOpen ? "Chatni yopish" : "AI Ustoz bilan gaplash"}
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        {isOpen ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <div className="text-3xl">🤖</div>
        )}
        {/* Notification dot */}
        {!isOpen && (
          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-[#12141d]" />
        )}
      </button>
    </div>
  );
}
