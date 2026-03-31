import json
import logging
import google.generativeai as genai
from openai import OpenAI
from typing import Any, Dict, List, Optional
from app.core.config import get_settings

logger = logging.getLogger("pyzone.ai")

class AIService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.openai_key = settings.openai_api_key
        self.model_names = [
            'gemini-1.5-flash', 
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp'
        ]
        
        # Simple in-memory cache for hints to save quota/cost
        # key: (problem_title, language, code_hash) 
        self._hint_cache: Dict[str, str] = {}
        
        if self.api_key:
            logger.info(f"Gemini initialized")
            genai.configure(api_key=self.api_key)
        
        self.openai_client = None
        if self.openai_key:
            logger.info(f"OpenAI initialized")
            self.openai_client = OpenAI(api_key=self.openai_key)

    def _get_cache_key(self, problem_title: str, language: str, code: str) -> str:
        import hashlib
        code_hash = hashlib.md5(code.encode()).hexdigest()
        return f"{problem_title}:{language}:{code_hash}"

    async def review_code(self, code: str, problem_title: str, language: str) -> Dict[str, Any]:
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

        # Try OpenAI first if available (often more reliable)
        if self.openai_client:
            try:
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={ "type": "json_object" }
                )
                return json.loads(response.choices[0].message.content)
            except Exception as e:
                logger.warning(f"OpenAI Review failed: {e}")

        # Fallback to Gemini
        if self.api_key:
            for model_name in self.model_names:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt)
                    text = response.text.strip()
                    if text.startswith("```json"):
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif text.startswith("```"):
                        text = text.split("```")[1].split("```")[0].strip()
                    return json.loads(text)
                except Exception as e:
                    logger.warning(f"Gemini Review failed with model {model_name}: {e}")
                    continue

        return {
            "overall_score": 0,
            "error": "All AI models failed",
            "time_complexity": {"detected": "Error", "optimal": "N/A", "suggestion": "Xizmat vaqtincha mavjud emas."},
            "space_complexity": {"detected": "Error", "suggestion": ""},
            "edge_cases": ["Texnik xatolik: AI bilan bog'lanib bo'lmadi."],
            "code_style": [],
            "alternative": ""
        }

    async def get_hint(self, code: str, problem_title: str, language: str) -> str:
        # 1. Check Cache
        cache_key = self._get_cache_key(problem_title, language, code)
        if cache_key in self._hint_cache:
            return self._hint_cache[cache_key]

        prompt = f"""
        Siz "Pyzone Arena" platformasida tajribali "AI Ustoz" (Tutor) role-idasiz. 
        Masala: "{problem_title}"
        Dasturlash tili: {language}
        
        FOYDALANUVCHI KODI:
        {code if code.strip() else "(Hali kod yo'q)"}
        
        VAZIFANGIZ:
        Dasturchi masala ustida qiynalib turibdi. Unga to'g'ri algoritmni tushunishga va qayerda xato qilayotganini topishga yordam bering.
        
        QAT'IY QOIDALAR:
        1. HECH QACHON to'liq kodni yozib bermang. Bu foydalanuvchiga bilim bermaydi.
        2. O'zbek tilida, juda sodda va rag'batlantiruvchi tilda javob bering.
        3. Javobingiz qisqa (3-4 jumla) va aniqlashtiruvchi savol yoki shama (hint) ko'rinishida bo'lsin.
        4. Algoritmni tushuntirishda metaforalardan foydalaning.
        5. Javobingiz faqat matn bo'lsin. Hech qanday markdown bloc yoki kod yozmang.
        
        Javobingiz:
        """

        errors = []
        
        # Try OpenAI (gpt-4o-mini is great for hints)
        if self.openai_client:
            try:
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}]
                )
                hint = response.choices[0].message.content.strip()
                self._hint_cache[cache_key] = hint
                return hint
            except Exception as e:
                err_msg = str(e)
                logger.warning(f"OpenAI Hint failed: {err_msg}")
                errors.append(f"OpenAI: {err_msg}")

        # Fallback to Gemini
        if self.api_key:
            for model_name in self.model_names:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt)
                    hint = response.text.strip()
                    self._hint_cache[cache_key] = hint
                    return hint
                except Exception as e:
                    err_msg = str(e)
                    logger.warning(f"Gemini Hint failed with model {model_name}: {err_msg}")
                    errors.append(f"{model_name}: {err_msg}")
                    continue

        error_details = "; ".join(errors)
        return f"Texnik xatolik: AI bilan bog'lanib bo'lmadi ({error_details}). Keyinroq qayta urining."

ai_service = AIService()

def get_ai_service() -> AIService:
    return ai_service
