import { useState, useRef, useEffect } from "react";
import { aiApi } from "../../lib/apiClient";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
};

type Props = {
  problemId: string;
  problemTitle: string;
  code: string;
  language: string;
};

export default function AIChatBot({ problemId, problemTitle, code, language }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: `Assalomu alaykum! Men sizning AI Ustozi-ingizman. "${problemTitle}" masalasida qiynalayotgan bo'lsangiz, mendan shama so'rab ko'ring! 👋`,
      sender: "bot",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Use the existing hint API but treat it as a conversational tutor
      const data = await aiApi.getHint({
        code,
        problem_slug: problemId,
        language
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.hint,
        sender: "bot",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Kechirasiz, hozirda javob bera olmayman. Texnik nosozlik yuz berdi.",
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">
      {/* Chat Window */}
      {isOpen && (
        <div className="pointer-events-auto mb-4 flex h-[480px] w-80 flex-col overflow-hidden rounded-2xl border border-indigo-500/20 bg-[#0f1117]/95 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-indigo-600 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl backdrop-blur-md">
                🤖
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">AI Ustoz (Pyzone)</h3>
                <p className="text-[10px] opacity-80">Hozirda faol • Shama (Hint)</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 transition hover:bg-white/10"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div 
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto p-4 scroll-smooth"
          >
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm ${
                    msg.sender === "user" 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-white/5 text-gray-200 border border-white/10 rounded-tl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-3 shadow-sm">
                  <div className="flex gap-1.5 items-center px-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-black/20 border-t border-white/5">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Savol yozing yoki shama so'rang..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="absolute right-2 p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-center text-gray-500">
               ⚠️ AI kodni to'liq holda yozib bermaydi.
            </p>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:shadow-indigo-500/20 active:scale-95 group relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        {isOpen ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <div className="text-3xl">🤖</div>
        )}
        {!isOpen && (
          <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 border-2 border-[#12141d] animate-pulse" />
        )}
      </button>
    </div>
  );
}
