import json
import logging
import google.generativeai as genai
from typing import Any, Dict
from app.core.config import get_settings

logger = logging.getLogger("pyzone.ai")

class AIService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.ai_api_key
        self.model_names = ['gemini-2.0-flash', 'gemini-1.5-flash']
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = None
        else:
            self.model = None

    async def review_code(self, code: str, problem_title: str, language: str) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "overall_score": 0,
                "time_complexity": {"detected": "N/A", "optimal": "N/A", "suggestion": "AI API Key not configured."},
                "space_complexity": {"detected": "N/A", "suggestion": ""},
                "edge_cases": ["AI is disabled. Please set ARENA_AI_API_KEY in environment."],
                "code_style": [],
                "alternative": ""
            }

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

        for model_name in self.model_names:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                text = response.text.strip()
                # Clean up potential markdown blocks if AI ignored "JSON ONLY"
                if text.startswith("```json"):
                    text = text.split("```json")[1].split("```")[0].strip()
                elif text.startswith("```"):
                    text = text.split("```")[1].split("```")[0].strip()
                
                return json.loads(text)
            except Exception as e:
                logger.warning(f"AI Review failed with model {model_name}: {e}")
                continue

        return {
            "overall_score": 0,
            "error": "All models failed",
            "time_complexity": {"detected": "Error", "optimal": "N/A", "suggestion": "Failed to generate review."},
            "space_complexity": {"detected": "Error", "suggestion": ""},
            "edge_cases": ["Technical error: All AI models failed."],
            "code_style": [],
            "alternative": ""
        }

    async def get_hint(self, code: str, problem_title: str, language: str) -> str:
        if not self.api_key:
            return "AI API Key not configured. Please set ARENA_AI_API_KEY."

        prompt = f"""
        As an expert software engineer and teacher, provide a subtle hint for the following {language} code for the problem "{problem_title}".
        
        CODE:
        {code if code.strip() else "(No code yet)"}
        
        The user is stuck. Give a HINT in Uzbek that helps them move forward without giving away the full solution.
        Be encouraging. Keep it short (2-3 sentences).
        
        HINT ONLY. No markdown blocks. No code.
        """

        for model_name in self.model_names:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                return response.text.strip()
            except Exception as e:
                logger.warning(f"AI Hint failed with model {model_name}: {e}")
                continue

        return "Texnik xatolik: AI bilan bog'lanib bo'lmadi. Keyinroq qayta urining."

ai_service = AIService()

def get_ai_service() -> AIService:
    return ai_service
