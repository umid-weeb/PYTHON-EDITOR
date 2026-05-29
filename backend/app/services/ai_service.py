import json
import logging
import tempfile
import textwrap
import httpx
from openai import OpenAI
from typing import Any, Dict, List, Optional
from app.core.config import get_settings

logger = logging.getLogger("pyzone.ai")


def _normalize_review_result(result: Any) -> Dict[str, Any]:
    """Ensure review output is usable and consistently phrased in Uzbek."""
    base = dict(result or {})

    time_complexity = dict(base.get("time_complexity") or {})
    space_complexity = dict(base.get("space_complexity") or {})

    time_complexity.setdefault("detected", "Ma'lumot yo'q")
    time_complexity.setdefault("optimal", "O(n) yoki yaxshiroq")
    time_complexity.setdefault("suggestion", "Vaqt murakkabligini Big-O ko'rinishida yozing; ms kabi birliklarni ishlatmang.")

    space_complexity.setdefault("detected", "Ma'lumot yo'q")
    space_complexity.setdefault("suggestion", "Xotira sarfini Big-O yoki bayt bo'yicha ayting; KB/MB o'rniga aniq birlikdan foydalaning.")

    base.setdefault("overall_score", 60)
    base.setdefault("beats", "Bu yechim 60/100 ballga yaqin; kichik yaxshilanishlar bilan natija sezilarli yaxshilanadi.")
    base.setdefault("summary", "Yechimning asosiy kuchli va zaif tomonlari haqida qisqacha xulosa.")
    # Never allow code in alternative: only plain Uzbek text, no code block, no def, no for, no return, no =
    alt = str(base.get("alternative") or "")
    if ("```" in alt or "def " in alt or "for " in alt or "return " in alt or " = " in alt):
        base["alternative"] = "Muqobil yondashuv: kod yozmang, faqat oddiy so'zlar bilan asosiy g'oyani va qaysi vosita (masalan dict yoki set) ishlatilishini tushuntiring."
    else:
        base["alternative"] = alt
    base.setdefault("edge_cases", ["Chekka holatlar va kiritish hajmi kichik bo'lsa ham to'g'ri ishlashi tekshirilishi kerak."])
    base.setdefault("code_style", ["Kod o'qilishi va saqlanishi oson bo'lishi kerak."])
    base["time_complexity"] = time_complexity
    base["space_complexity"] = space_complexity

    return base


def _extract_code_block(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 2:
            candidate = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
            return candidate.strip()
    return cleaned


def _normalize_code_text(code: str) -> str:
    return textwrap.dedent(code or "").strip()


def _is_echoed_solution(candidate: str, original: str) -> bool:
    return _normalize_code_text(candidate) == _normalize_code_text(original)


def _validate_python_snippet(code: str) -> list[str]:
    snippet = _normalize_code_text(code)
    if not snippet:
        return ["Kod bo'sh. Iltimos, yechimni qayta yozing."]
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as handle:
            handle.write(snippet)
            path = handle.name
        compile(snippet, path, "exec")
    except Exception as exc:
        return [f"Syntax xatosi: {exc}"]
    return []


# Gemini REST API — v1
_GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1/models"
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]

# Groq models (OpenAI-compatible, free tier: 30 RPM, 14400 RPD)
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_GROQ_MODEL = "llama-3.3-70b-versatile"

# --------------------------------------------------------------------------- #
#  System prompt for the AI tutor chatbot                                      #
# --------------------------------------------------------------------------- #
_CHAT_SYSTEM_PROMPT = """Sen "Pyzone Arena" platformasining AI Ustozi — algoritmlar bo'yicha o'qituvchisan.

!!! MUTLAQ TAQIQ — BUZILMAYDI !!!
KOD YOZMA. Hech qachon. Hech qanday sharoitda.
`def`, `class`, `for`, `while`, `return`, ` = ` kabi Python sintaksisini YOZMA.
Kod bloki (``` yoki `...`) YOZMA.
Faqat SO'Z bilan tushuntir. Faqat PSEUDOCODE (ingliz/o'zbek so'zlari bilan algoritm tavsifi).

AGAR FOYDALANUVCHI "KOD YOZ" / "YECHIM BER" / "TO'G'RI KOD" SO'RASA:
Faqat nima xato ekanini SO'Z bilan ayt. Masalan:
  YOMON: `if mid > target: right = mid - 1`
  YAXSHI: "mid indeksidagi qiymat targetdan katta bo'lsa, o'ng chegarani mid-1 ga o'zgartir"

JAVOB FORMATI:
- Faqat O'ZBEK tilida
- 3-5 jumla, qisqa
- Xatoni toping, yo'nalish bering, savol bering

RUXSAT: algoritmlar, Big O, masala mantiqiy tahlili, debugging (faqat so'z bilan)
TAQIQ: to'liq kod, hayotiy suhbat, boshqa fanlar

MASALA KONTEKSTI:
{problem_context}

FOYDALANUVCHI KODI ({language}):
{code}
"""

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


class AIService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.openai_key = settings.openai_api_key
        self.groq_key = settings.groq_api_key

        self._review_cache: Dict[str, Any] = {}

        # Groq client (OpenAI-compatible)
        self.groq_client = None
        if self.groq_key:
            logger.info("Groq initialized")
            self.groq_client = OpenAI(
                api_key=self.groq_key,
                base_url=_GROQ_BASE_URL,
            )

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
        return await self._gemini_generate_ext(model, prompt, max_tokens=512)

    async def _gemini_generate_ext(self, model: str, prompt: str, max_tokens: int = 1024) -> str:
        url = f"{_GEMINI_REST_BASE}/{model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.3,
            },
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
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
    async def review_code(
        self,
        code: str,
        problem_title: str,
        language: str,
        problem_description: str = "",
        constraints: str = "",
    ) -> Dict[str, Any]:
        import hashlib
        code_snapshot = code.strip() if isinstance(code, str) else ""
        cache_key = hashlib.md5(
            f"{problem_title}:{language}:{code_snapshot}:{problem_description}:{constraints}".encode()
        ).hexdigest()
        if cache_key in self._review_cache:
            return self._review_cache[cache_key]

        code_text = code.strip() or (
            'Hali hech qanday yechim yuborilmagan. Masala shartiga asoslanib, eng yaxshi '
            'algoritmik yo\'nalishni, vaqt va xotira murakkabligini, chekka holatlarni va '
            'takomillashtirish tavsiyalarini bering.'
        )

        prompt = f"""
Siz {language} tilidagi "{problem_title}" masalasining yechimi uchun mutaxassis dasturchisiz.

Masala sharti:
{problem_description or 'Masala tavsifi berilmagan.'}

Cheklovlar:
{constraints or 'Maxsus cheklovlar berilmagan.'}

Joriy yechim (agar mavjud bo'lsa):
{code_text}

QOIDALAR:
- Faqat STRICT JSON qaytaring (markdown yoki matn bo'lmasin).
- Vaqt murakkabligini faqat Big-O ko'rinishida yozing: O(1), O(log n), O(n), O(n log n), O(n^2) va h.k.
- Xotira murakkabligini Big-O yoki baytlar bilan ayting; KB/MB kabi birliklarni noto'g'ri ko'rsatmaslikka harakat qiling.
- Muqobil yondashuvni har doim oddiy so'zlar bilan ayting; kod blokini yozmang, faqat g'oya va qaysi vosita (masalan dict yoki set) ishlatilishi kerakligini ayting.
- overall_score 0-100 orasida bo'lsin; 100 — to'liq ishonchli va tez yechim, 0 — juda zaif yechim.
- Tavsiyalar va xulosalar o'zbek tilida bo'lsin, oddiy, muloyim va amaliy bo'lsin.

JSON shakli:
{{
  "overall_score": <int 0-100>,
  "beats": "<str>",
  "summary": "<o'zbekcha qisqa xulosa>",
  "time_complexity": {{"detected": "<str>", "optimal": "<str>", "suggestion": "<str>"}},
  "space_complexity": {{"detected": "<str>", "suggestion": "<str>"}},
  "edge_cases": ["<str>", ...],
  "code_style": ["<str>", ...],
  "alternative": "<str>",
  "beats": "<str>"
}}
"""
        # 1. Groq (primary — free, fast)
        if self.groq_client:
            try:
                resp = self.groq_client.chat.completions.create(
                    model=_GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    max_tokens=512,
                )
                result = _normalize_review_result(json.loads(resp.choices[0].message.content))
                self._review_cache[cache_key] = result
                return result
            except Exception as e:
                logger.warning(f"Groq Review: {e}")

        # 2. Gemini REST fallback
        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    text = await self._gemini_generate(model, prompt)
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                        text = text.split("```")[0].strip()
                    result = _normalize_review_result(json.loads(text))
                    self._review_cache[cache_key] = result
                    return result
                except Exception as e:
                    logger.warning(f"Gemini Review {model}: {e}")
                    continue

        # 3. OpenAI fallback
        if self.openai_client:
            try:
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                )
                result = _normalize_review_result(json.loads(resp.choices[0].message.content))
                self._review_cache[cache_key] = result
                return result
            except Exception as e:
                logger.warning(f"OpenAI Review: {e}")

        return _normalize_review_result({
            "overall_score": 0,
            "error": "AI xizmat vaqtincha mavjud emas",
            "summary": "AI tahlili hozircha mavjud emas. Masalani o'zingiz tahlil qilib, vaqt murakkabligini Big-O ko'rinishida va xotira sarfini aniq belgilang.",
            "time_complexity": {
                "detected": "Noma'lum",
                "optimal": "O(n) yoki yaxshiroq",
                "suggestion": "Vaqt murakkabligini ms o'rniga Big-O ko'rinishida yozing.",
            },
            "space_complexity": {
                "detected": "Noma'lum",
                "suggestion": "Xotira sarfini baytlar yoki Big-O bilan tasvirlang; KB/MB ishlatmang.",
            },
            "edge_cases": ["AI tahlili vaqtincha mavjud emas, shuning uchun chekka holatlar va testlar o'zingiz tekshiring."],
            "code_style": ["Kodni o'qilishi va tushunarli bo'lishi kerak."],
            "alternative": "Masalani hal qilish uchun eng sodda yondashuvni tanlang va chekka holatlarni alohida tekshiring.",
        })

    async def _generate_json_payload(self, prompt: str, max_tokens: int = 700) -> Dict[str, Any] | None:
        if self.groq_client:
            try:
                resp = self.groq_client.chat.completions.create(
                    model=_GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    max_tokens=max_tokens,
                )
                return json.loads(resp.choices[0].message.content)
            except Exception as exc:
                logger.warning(f"Groq code generation failed: {exc}")

        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    text = await self._gemini_generate(model, prompt)
                    return json.loads(_extract_code_block(text))
                except Exception as exc:
                    logger.warning(f"Gemini code generation failed for {model}: {exc}")
                    continue

        if self.openai_client:
            try:
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    max_tokens=max_tokens,
                )
                return json.loads(resp.choices[0].message.content)
            except Exception as exc:
                logger.warning(f"OpenAI code generation failed: {exc}")

        return None

    # ----------------------------------------------------------------------- #
    #  Code generation (code-first, validation-aware)                         #
    # ----------------------------------------------------------------------- #
    async def generate_solution(
        self,
        code: str,
        problem_title: str,
        language: str,
        problem_description: str = "",
        constraints: str = "",
        prompt = f"""
Siz {language} tilida "{problem_title}" masalasining to'g'ri yechimini yozuvchi mutaxassis dasturchisiz.

Masala sharti:
{problem_description or 'Masala tavsifi berilmagan.'}

Cheklovlar:
{constraints or 'Maxsus cheklovlar berilmagan.'}

Foydalanuvchi yozgan kodi (faqat kontekst uchun; uni takrorlamang):
{code or "Hali yechim mavjud emas; agar kerak bo'lsa, to'liq yangi yechim yozing."}

        ) -> Dict[str, Any]:
                prompt = f"""
Siz {language} tilida "{problem_title}" masalasining to'g'ri yechimini yozuvchi mutaxassis dasturchisiz.

Masala sharti:
{problem_description or 'Masala tavsifi berilmagan.'}

Cheklovlar:
{constraints or 'Maxsus cheklovlar berilmagan.'}

Foydalanuvchi yozgan kodi (faqat kontekst uchun; uni takrorlamang):
{code or "Hali yechim mavjud emas; agar kerak bo'lsa, to'liq yangi yechim yozing."}

- Koddan keyin 1-2 ta qisqa test holatini ham yozing.

JSON shakli:
{{
    "code": "<to'liq yechim kodi>",
    "summary": "<o'zbekcha qisqa xulosa>",
    "tests": ["<test holati 1>", "<test holati 2>"]
}}
- Faqat to'g'ri Python kodini qaytaring.
- Xatolarni tuzating.
- Hech qanday izoh bermang.

JSON shakli:
{{"code": "<to'g'irlangan kod>", "summary": "<qisqa xulosa>", "tests": ["<test>"]}}
"""
                fixed = await self._generate_json_payload(fix_prompt, max_tokens=700)
                if fixed is not None:
                    fixed["code"] = _extract_code_block(fixed.get("code", ""))
                    fixed_errors = _validate_python_snippet(fixed.get("code", ""))
                        payload = fixed
                    else:
                        payload["validation_errors"] = errors + fixed_errors
                else:
                    payload["validation_errors"] = errors
            elif errors:
                payload["validation_errors"] = errors
            return payload

        return {
            "code": "",
            "summary": "AI kod yaratish xizmati hozircha mavjud emas.",
    # ----------------------------------------------------------------------- #
    async def get_chat_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        problem_title: str,
        constraints: str,
        code: str,
                    prompt = f"""
        language: str,
    ) -> str:
        problem_context = (
            f'Masala: "{problem_title}"\n'
            f"Tavsif: {problem_description[:600] if problem_description else 'Mavjud emas'}\n"
            f"Cheklovlar: {constraints[:300] if constraints else 'Mavjud emas'}"
        )

        system_prompt = _CHAT_SYSTEM_PROMPT.format(
        full_prompt = "\n".join(lines)


        # Helper: build messages list for OpenAI-compatible clients
        def build_messages() -> list:
            msgs = [{"role": "system", "content": system_prompt}]
            for msg in conversation_history:
                msgs.append({"role": msg["role"], "content": msg["content"]})
        prompt = f"""
            msgs.append({"role": "user", "content": user_message})
            return msgs

        # 1. Groq (primary — free, 30 RPM, LLaMA 3.3 70B)
        if self.groq_client:
                return resp.choices[0].message.content.strip()
        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    return await self._gemini_generate(model, full_prompt)
                except Exception as e:
                    err = str(e)
                    logger.warning(f"Gemini Chat {model}: {err}")
                    errors.append(f"{model}: {err}")
        prompt = f"""
                    continue

        # 3. OpenAI fallback
        if self.openai_client:
            try:
                resp = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=build_messages(),
                    max_tokens=400,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e:
    # ----------------------------------------------------------------------- #
    #  Online editor chat                                                      #
    # ----------------------------------------------------------------------- #
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
            except Exception as e:
                err = str(e)
                logger.warning(f"Groq Editor Chat: {err}")
                errors.append(f"Groq: {err}")

        if self.api_key:
            for model in _GEMINI_MODELS:
                try:
                    return await self._gemini_generate(model, full_prompt)
                except Exception as e:
                    err = str(e)
                    logger.warning(f"Gemini Editor Chat {model}: {err}")
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
            except Exception as e:
                err = str(e)
                logger.warning(f"OpenAI Editor Chat: {err}")
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
