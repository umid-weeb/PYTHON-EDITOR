import json
import logging
import httpx
from openai import OpenAI
from typing import Any, Dict, List, Optional
from app.core.config import get_settings

logger = logging.getLogger("pyzone.ai")

# Gemini REST API — v1 (not v1beta, which is outdated and missing models)
_GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1/models"
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-8b",
]

# --------------------------------------------------------------------------- #
#  System prompt for the AI tutor chatbot                                      #
# --------------------------------------------------------------------------- #
_CHAT_SYSTEM_PROMPT = """Sen "Pyzone Arena" platformasining AI Ustozi — algoritmlar va ma'lumot strukturalari bo'yicha tajribali o'qituvchisan.

HECH QACHON BUZILMAYDIGAN QOIDALAR:
1. TO'LIQ YECHIM KODI YOZMA — hech qachon, hech qanday sababda. Faqat PSEUDOCODE ruxsat.
2. Faqat O'ZBEK tilida javob ber.
3. Javob QISQA: 2-4 jumla. Ortiqcha tushuntirma keraksiz.
4. Foydalanuvchini O'YLASHGA undovchi savol ber, javobni berma.

RUXSAT ETILGAN MAVZULAR:
- Algoritmlar (sorting, searching, two-pointer, sliding window, greedy, DP, backtracking, BFS/DFS)
- Ma'lumot strukturalari (array, stack, queue, tree, graph, hashmap, set)
- Vaqt va xotira murakkabligi (Big O)
- Masala mantiqiy tahlili, yo'nalish berish, debugging maslahat

TAQIQLANGAN MAVZULAR:
- To'liq yechim kodi (hatto "faqat bir qism" bo'lsa ham)
- Hayot, ta'lim, siyosat, umumiy suhbat
- Boshqa fanlar yoki algoritmdan tashqari mavzular

MAVZUDAN CHIQQANDA, qat'iy tarzda de:
"Uzr, bu savolga javob bera olmayman. Keling, masalaga qaytaylik!"

AGAR FOYDALANUVCHI "KOD YOZ" DESA:
"Kodni to'g'ridan-to'g'ri bermayman — o'zing yechsang, intervyuda ham bajara olasan! Bir yo'nalish bersam..."

MASALA KONTEKSTI:
{problem_context}

FOYDALANUVCHI HOZIRGI KODI ({language}):
{code}
"""


class AIService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.openai_key = settings.openai_api_key

        self._review_cache: Dict[str, Any] = {}

        self.openai_client = None
        if self.openai_key:
            logger.info("OpenAI initialized")
            self.openai_client = OpenAI(api_key=self.openai_key)

        if self.api_key:
            logger.info("Gemini REST API initialized")

    # ----------------------------------------------------------------------- #
    #  Gemini via direct REST (bypasses v1beta SDK issue)                      #
    # ----------------------------------------------------------------------- #
    async def _gemini_generate(self, model: str, prompt: str) -> str:
        url = f"{_GEMINI_REST_BASE}/{model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": 512,
                "temperature": 0.7,
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json=payload,
                params={"key": self.api_key},
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    # ----------------------------------------------------------------------- #
    #  Code Review                                                              #
    # ----------------------------------------------------------------------- #
    async def review_code(self, code: str, problem_title: str, language: str) -> Dict[str, Any]:
        import hashlib
        cache_key = hashlib.md5(f"{problem_title}:{language}:{code}".encode()).hexdigest()
        if cache_key in self._review_cache:
            return self._review_cache[cache_key]

        prompt = f"""
As an expert software engineer, review this {language} code for the problem "{problem_title}".

CODE:
{code}

Return STRICT JSON only (no markdown):
{{
  "overall_score": <int 1-10>,
  "time_complexity": {{"detected": "<str>", "optimal": "<str>", "suggestion": "<str>"}},
  "space_complexity": {{"detected": "<str>", "suggestion": "<str>"}},
  "edge_cases": ["<str>", ...],
  "code_style": ["<str>", ...],
  "alternative": "<str>"
}}
"""
        # Try Gemini REST
        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    text = await self._gemini_generate(model, prompt)
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                        text = text.split("```")[0].strip()
                    result = json.loads(text)
                    self._review_cache[cache_key] = result
                    return result
                except Exception as e:
                    logger.warning(f"Gemini Review {model}: {e}")
                    continue

        # Fallback OpenAI
        if self.openai_client:
            try:
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
                result = json.loads(resp.choices[0].message.content)
                self._review_cache[cache_key] = result
                return result
            except Exception as e:
                logger.warning(f"OpenAI Review: {e}")

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
        problem_context = (
            f'Masala: "{problem_title}"\n'
            f"Tavsif: {problem_description[:600] if problem_description else 'Mavjud emas'}\n"
            f"Cheklovlar: {constraints[:300] if constraints else 'Mavjud emas'}"
        )

        system_prompt = _CHAT_SYSTEM_PROMPT.format(
            problem_context=problem_context,
            language=language,
            code=code.strip() if code.strip() else "(Hali kod yozilmagan)",
        )

        # Build flat prompt with conversation history
        lines = [system_prompt, ""]
        for msg in conversation_history:
            label = "Foydalanuvchi" if msg["role"] == "user" else "AI Ustoz"
            lines.append(f"{label}: {msg['content']}")
        lines.append(f"Foydalanuvchi: {user_message}")
        lines.append("AI Ustoz:")
        full_prompt = "\n".join(lines)

        errors: list[str] = []

        # Try Gemini REST
        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    return await self._gemini_generate(model, full_prompt)
                except Exception as e:
                    err = str(e)
                    logger.warning(f"Gemini Chat {model}: {err}")
                    errors.append(f"{model}: {err}")
                    continue

        # Fallback OpenAI
        if self.openai_client:
            try:
                messages = [{"role": "system", "content": system_prompt}]
                for msg in conversation_history:
                    messages.append({"role": msg["role"], "content": msg["content"]})
                messages.append({"role": "user", "content": user_message})
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=400,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e:
                err = str(e)
                logger.warning(f"OpenAI Chat: {err}")
                errors.append(f"OpenAI: {err}")

        return f"Texnik xatolik: AI bilan bog'lanib bo'lmadi ({'; '.join(errors)}). Keyinroq qayta urining."

    # Legacy hint (backward compat)
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
