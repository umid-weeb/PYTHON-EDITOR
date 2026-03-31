import google.generativeai as genai
import os
from app.core.config import get_settings

def diag_models():
    settings = get_settings()
    api_key = settings.ai_api_key
    if not api_key:
        print("ARENA_AI_API_KEY topilmadi.")
        return

    genai.configure(api_key=api_key)
    print("Mavjud Gemini modellari:")
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name} ({m.display_name})")
    except Exception as e:
        print(f"Xatolik modellar ro'yxatini olishda: {e}")

if __name__ == "__main__":
    diag_models()
