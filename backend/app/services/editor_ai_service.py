import json
import logging
from typing import Any, Dict, List

import httpx
from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger("pyzone.editor_ai")

_GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1/models"
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_GROQ_MODEL = "llama-3.3-70b-versatile"

_EDITOR_CHAT_SYSTEM_PROMPT = """Sen Pyzone online editor uchun aqlli kod yordamchisan.

MAQSAD:
- Foydalanuvchi yozayotgan kod, tanlangan matn, til, starter pack, natija paneli va kursor joylashuviga qarab aniq yordam ber.
- Foydalanuvchi nimani maqsad qilganini tushunib, unga eng qisqa va foydali yo'lni ko'rsat.
- Kodning maqsadini bir jumlada ayt: masalan, massivni yig'ish, satrni parse qilish, shartni tekshirish yoki formatlangan output chiqarish.

JAVOB QOIDALARI:
- Faqat o'zbek tilida javob ber.
- Xatoni aniq top: qaysi qator, qaysi qism va nima uchun xato ekanini sodda ayt.
- Agar foydalanuvchi yechim so'rasa, minimal va ishlaydigan snippet berishing mumkin.
- Agar faqat tushuntirish so'rasa, ortiqcha kod yozma.
- Javob qisqa, amaliy va muloyim bo'lsin.
- Agar savol noaniq bo'lsa, bitta aniqlashtiruvchi savol ber.
- Kodni copy-paste qilishga qulay tarzda tartibli yoz.

EDITOR KONTEKSTI:
{editor_context}

TANLANGAN MATN:
{selected_text}

JORIY KOD:
{code}

NATIJA PANELI:
{output_text}
"""


class EditorAIService:
    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.openai_key = settings.openai_api_key
        self.groq_key = settings.groq_api_key

        self.groq_client = None
        if self.groq_key:
            logger.info("Groq editor assistant initialized")
            self.groq_client = OpenAI(
                api_key=self.groq_key,
                base_url=_GROQ_BASE_URL,
            )

        self.openai_client = None
        if self.openai_key:
            logger.info("OpenAI editor assistant initialized")
            self.openai_client = OpenAI(api_key=self.openai_key)

        if self.api_key:
            logger.info("Gemini editor assistant initialized")

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

    async def get_editor_chat_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        language: str,
        code: str,
        starter_pack: str,
        selected_text: str = "",
        output_text: str = "",
        cursor_line: int = 1,
        cursor_column: int = 1,
        line_count: int = 0,
        is_dark_mode: bool = False,
    ) -> str:
        def trim(value: str, limit: int) -> str:
            text = (value or "").strip()
            if len(text) <= limit:
                return text
            return text[:limit].rstrip() + "..."

        normalized_code = trim(code, 7000) or "(Hali kod yozilmagan)"
        normalized_selected = trim(selected_text, 1800) or "(Tanlangan matn yo'q)"
        normalized_output = trim(output_text, 1800) or "(Natija paneli hozircha bo'sh)"
        editor_context = (
            f"Til: {language}\n"
            f"Starter pack: {starter_pack or 'default'}\n"
            f"Kursor: satr {max(1, int(cursor_line or 1))}, ustun {max(1, int(cursor_column or 1))}\n"
            f"Satrlar soni: {max(0, int(line_count or 0))}\n"
            f"Tema: {'dark' if is_dark_mode else 'light'}\n"
            f"Foydalanuvchi savoli: {trim(user_message, 1000)}"
        )

        system_prompt = _EDITOR_CHAT_SYSTEM_PROMPT.format(
            editor_context=editor_context,
            selected_text=normalized_selected,
            code=normalized_code,
            output_text=normalized_output,
        )

        history_lines = [system_prompt, ""]
        for msg in conversation_history:
            label = "Foydalanuvchi" if msg["role"] == "user" else "AI Yordamchi"
            history_lines.append(f"{label}: {msg['content']}")
        history_lines.append(f"Foydalanuvchi: {user_message}")
        history_lines.append("AI Yordamchi:")
        full_prompt = "\n".join(history_lines)

        def build_messages() -> list:
            msgs = [{"role": "system", "content": system_prompt}]
            for msg in conversation_history:
                msgs.append({"role": msg["role"], "content": msg["content"]})
            msgs.append({"role": "user", "content": user_message})
            return msgs

        errors: list[str] = []

        if self.groq_client:
            try:
                resp = self.groq_client.chat.completions.create(
                    model=_GROQ_MODEL,
                    messages=build_messages(),
                    max_tokens=420,
                )
                return resp.choices[0].message.content.strip()
            except Exception as exc:
                err = str(exc)
                logger.warning("Groq editor chat: %s", err)
                errors.append(f"Groq: {err}")

        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    return await self._gemini_generate(model, full_prompt)
                except Exception as exc:
                    err = str(exc)
                    logger.warning("Gemini editor chat %s: %s", model, err)
                    errors.append(f"{model}: {err}")
                    continue

        if self.openai_client:
            try:
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=build_messages(),
                    max_tokens=420,
                )
                return resp.choices[0].message.content.strip()
            except Exception as exc:
                err = str(exc)
                logger.warning("OpenAI editor chat: %s", err)
                errors.append(f"OpenAI: {err}")

        return f"Texnik xatolik: AI bilan bog'lanib bo'lmadi ({'; '.join(errors)}). Keyinroq qayta urining."


editor_ai_service = EditorAIService()


def get_editor_ai_service() -> EditorAIService:
    return editor_ai_service
