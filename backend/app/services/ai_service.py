import json
import logging
import google.generativeai as genai
from openai import OpenAI
from typing import Any, Dict, List, Optional
from app.core.config import get_settings

logger = logging.getLogger("pyzone.ai")

# --------------------------------------------------------------------------- #
#  System prompt for the AI tutor chatbot                                      #
# --------------------------------------------------------------------------- #
_CHAT_SYSTEM_PROMPT = """Sen "Pyzone Arena" platformasining AI Ustozi — algoritmlar va ma'lumot strukturalari bo'yicha tajribali o'qituvchisan.

═══════════════════════════════════════════
 HECH QACHON BUZILMAYDIGAN QOIDALAR
═══════════════════════════════════════════
1. TO'LIQ YECHIM KODI YOZMA — hech qachon, hech qanday sababda.
   Faqat PSEUDOCODE (so'z bilan algoritm tavsifi) ruxsat etilgan.
2. Faqat O'ZBEK tilida javob ber.
3. Javob QISQA: 2–4 jumla. Ortiqcha tushuntirma keraksiz.
4. Foydalanuvchini O'YLASHGA undovchi savol ber, javobni ber emas.

═══════════════════════════════════════════
 RUXSAT ETILGAN MAVZULAR
═══════════════════════════════════════════
✅ Algoritmlar (sorting, searching, two-pointer, sliding window, greedy, DP, backtracking, BFS/DFS...)
✅ Ma'lumot strukturalari (array, stack, queue, tree, graph, hashmap, set...)
✅ Vaqt va xotira murakkabligi (Big O tahlili)
✅ Masala mantiqiy tahlili va yo'nalish berish
✅ Kodda xato topishga yordam (debugging maslahat)

═══════════════════════════════════════════
 TAQIQLANGAN MAVZULAR
═══════════════════════════════════════════
❌ To'liq yechim kodi (hatto "faqat bir qism" desa ham)
❌ Hayot, ta'lim, siyosat, umumiy suhbat
❌ Boshqa fanlar (matematika darsining umumiy mavzulari, fizika, ingliz tili...)
❌ Loyiha/app ishlab chiqish (faqat algoritmdan tashqari narsalar)

MAVZUDAN CHIQQANDA: Qat'iy va xushmuomala tarzda:
"Uzr, bu savolga javob bera olmayman — bu algoritmash mavzusidan tashqarida. Keling, {masala} masalasiga qaytaylik! Qayerda qiynalyapsiz?"

═══════════════════════════════════════════
 HINT BERISH STRATEGIYASI (bosqichli)
═══════════════════════════════════════════
• 1–2-savol: Juda noaniq yo'nalish — "Bu masalada massivni ko'rib chiqishning qaysi usuli tez ishlaydi?"
• 3–4-savol: Biroz aniqroq — "Ikki pointer texnikasi yoki hashmap bu yerda foydali bo'ladi"
• 5+ savol: Aniq qadamlab tushuntir — faqat so'z va pseudocode bilan, KOD YO'Q

AGAR FOYDALANUVCHI "KOD YOZ" / "YECHIM BER" / "SOLVE QIL" DESA:
"Kodni to'g'ridan-to'g'ri berib yubormayman — o'zing yechsang, intervyuda ham bajara olasan!
Bir maslahat: {kichik_yo'nalish}"

═══════════════════════════════════════════
 JORIY KONTEKST
═══════════════════════════════════════════
{problem_context}

FOYDALANUVCHI HOZIRGI KODI ({language}):
{code}
"""


class AIService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.openai_key = settings.openai_api_key
        # Gemini first (free tier), OpenAI as last fallback
        self.gemini_models = [
            "gemini-1.5-flash",
            "gemini-2.0-flash-exp",
            "gemini-1.5-pro",
        ]

        # Simple in-memory cache for review results (code review is expensive)
        self._review_cache: Dict[str, Any] = {}

        if self.api_key:
            logger.info("Gemini initialized")
            genai.configure(api_key=self.api_key)

        self.openai_client = None
        if self.openai_key:
            logger.info("OpenAI initialized")
            self.openai_client = OpenAI(api_key=self.openai_key)

    # ----------------------------------------------------------------------- #
    #  Code Review                                                              #
    # ----------------------------------------------------------------------- #
    async def review_code(self, code: str, problem_title: str, language: str) -> Dict[str, Any]:
        import hashlib
        cache_key = hashlib.md5(f"{problem_title}:{language}:{code}".encode()).hexdigest()
        if cache_key in self._review_cache:
            return self._review_cache[cache_key]

        prompt = f"""
        As an expert software engineer and competitive programmer, review the following {language} code for the problem "{problem_title}".

        CODE:
        {code}

        Provide your review in STRICT JSON format with the following keys:
        - overall_score: (int from 1-10)
        - time_complexity: {{ "detected": str, "optimal": str, "suggestion": str }}
        - space_complexity: {{ "detected": str, "suggestion": str }}
        - edge_cases: [list of strings for missed edge cases]
        - code_style: [list of strings for style improvements]
        - alternative: str (a brief description of a better or alternative approach)

        JSON ONLY. No markdown blocks.
        """

        # Try Gemini first (free)
        if self.api_key:
            for model_name in self.gemini_models:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt)
                    text = response.text.strip()
                    if text.startswith("```json"):
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif text.startswith("```"):
                        text = text.split("```")[1].split("```")[0].strip()
                    result = json.loads(text)
                    self._review_cache[cache_key] = result
                    return result
                except Exception as e:
                    logger.warning(f"Gemini Review failed with {model_name}: {e}")
                    continue

        # Fallback to OpenAI
        if self.openai_client:
            try:
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
                result = json.loads(response.choices[0].message.content)
                self._review_cache[cache_key] = result
                return result
            except Exception as e:
                logger.warning(f"OpenAI Review failed: {e}")

        return {
            "overall_score": 0,
            "error": "All AI models failed",
            "time_complexity": {"detected": "Error", "optimal": "N/A", "suggestion": "Xizmat vaqtincha mavjud emas."},
            "space_complexity": {"detected": "Error", "suggestion": ""},
            "edge_cases": ["Texnik xatolik: AI bilan bog'lanib bo'lmadi."],
            "code_style": [],
            "alternative": "",
        }

    # ----------------------------------------------------------------------- #
    #  Chat (multi-turn tutor)                                                  #
    # ----------------------------------------------------------------------- #
    async def get_chat_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        problem_title: str,
        problem_description: str,
        constraints: str,
        code: str,
        language: str,
    ) -> str:
        """
        Multi-turn AI tutor response.
        conversation_history: [{"role": "user"|"assistant", "content": "..."}, ...]
        Returns plain text reply (no code, Uzbek).
        """
        problem_context = (
            f'Masala: "{problem_title}"\n'
            f"Vazifa tavsifi: {problem_description[:600] if problem_description else 'Mavjud emas'}\n"
            f"Cheklovlar: {constraints[:300] if constraints else 'Mavjud emas'}"
        )

        system_prompt = _CHAT_SYSTEM_PROMPT.format(
            masala=problem_title,
            problem_context=problem_context,
            language=language,
            code=code.strip() if code.strip() else "(Hali kod yozilmagan)",
        )

        errors: list[str] = []

        # Build a single flat prompt with conversation history embedded.
        # This avoids start_chat/system_instruction API version differences.
        def build_full_prompt() -> str:
            lines = [system_prompt, ""]
            for msg in conversation_history:
                label = "Foydalanuvchi" if msg["role"] == "user" else "AI Ustoz"
                lines.append(f"{label}: {msg['content']}")
            lines.append(f"Foydalanuvchi: {user_message}")
            lines.append("AI Ustoz:")
            return "\n".join(lines)

        full_prompt = build_full_prompt()

        # --- Try Gemini (free, preferred) ---
        if self.api_key:
            for model_name in self.gemini_models:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(full_prompt)
                    return response.text.strip()
                except Exception as e:
                    err = str(e)
                    logger.warning(f"Gemini Chat failed with {model_name}: {err}")
                    errors.append(f"{model_name}: {err}")
                    continue

        # --- Fallback: OpenAI ---
        if self.openai_client:
            try:
                messages = [{"role": "system", "content": system_prompt}]
                for msg in conversation_history:
                    messages.append({"role": msg["role"], "content": msg["content"]})
                messages.append({"role": "user", "content": user_message})

                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=400,
                )
                return response.choices[0].message.content.strip()
            except Exception as e:
                err = str(e)
                logger.warning(f"OpenAI Chat failed: {err}")
                errors.append(f"OpenAI: {err}")

        error_details = "; ".join(errors)
        return f"Texnik xatolik: AI bilan bog'lanib bo'lmadi ({error_details}). Keyinroq qayta urining."

    # ----------------------------------------------------------------------- #
    #  Legacy single-shot hint (kept for AIReviewPanel backward compat)        #
    # ----------------------------------------------------------------------- #
    async def get_hint(self, code: str, problem_title: str, language: str) -> str:
        return await self.get_chat_response(
            user_message="Menga bu masalada bitta kichik shama bering.",
            conversation_history=[],
            problem_title=problem_title,
            problem_description="",
            constraints="",
            code=code,
            language=language,
        )


ai_service = AIService()


def get_ai_service() -> AIService:
    return ai_service
