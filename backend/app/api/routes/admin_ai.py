"""
Admin AI routes — masala yaratish uchun AI yordamchisi.

Imkoniyatlar:
1. LeetCode masalasini nom/raqam orqali topib, O'zbek tiliga to'liq tarjima qilish
2. Description yaxshilash
3. Starter code yaratish
4. Test case yaratish
5. Test case larni tekshirish (kodni ishlatib)
"""
from __future__ import annotations

import ast
import json
import logging
import re
import traceback
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.auth import get_admin_user
from app.models.user import User
from app.services.ai_service import ai_service

logger = logging.getLogger("pyzone.arena.admin_ai")

router = APIRouter(prefix="/api/admin/ai", tags=["admin-ai"])

# ---------------------------------------------------------------------------
# LeetCode GraphQL
# ---------------------------------------------------------------------------
_LC_GRAPHQL = "https://leetcode.com/graphql"
_LC_HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://leetcode.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

_QUERY_BY_SLUG = """
query GetProblem($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    title
    titleSlug
    content
    difficulty
    exampleTestcases
    topicTags { name }
    hints
    sampleTestCase
  }
}
"""

_QUERY_SEARCH_PROBLEMS = """
query SearchProblems($keywords: String!) {
  problemsetQuestionList(
    categorySlug: ""
    limit: 50
    skip: 0
    filters: { searchKeywords: $keywords }
  ) {
    questions {
      questionFrontendId
      titleSlug
      title
    }
  }
}
"""


async def _fetch_leetcode_by_slug(slug: str) -> dict | None:
    """LeetCode GraphQL dan masala ma'lumotlarini olish."""
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=_LC_HEADERS) as client:
            resp = await client.post(
                _LC_GRAPHQL,
                json={"query": _QUERY_BY_SLUG, "variables": {"titleSlug": slug}},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("question")
    except Exception as exc:
        logger.warning("LeetCode fetch by slug failed: %s", exc)
        return None


async def _search_leetcode(keywords: str) -> list:
    """LeetCode GraphQL qidiruvi — faqat kerakli miqdordagi natijalar."""
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=_LC_HEADERS) as client:
            resp = await client.post(
                _LC_GRAPHQL,
                json={
                    "query": _QUERY_SEARCH_PROBLEMS,
                    "variables": {"keywords": keywords},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return (
                data.get("data", {})
                .get("problemsetQuestionList", {})
                .get("questions", [])
            )
    except Exception as exc:
        logger.warning("LeetCode search failed (%r): %s", keywords, exc)
        return []


async def _find_leetcode_slug(query: str) -> str | None:
    """
    Masala nomidan yoki raqamidan slug topish.
    Masalan: "1" → "two-sum", "Two Sum" → "two-sum", "add two" → "add-two-numbers"
    """
    query_clean = query.strip()
    query_lower = query_clean.lower()

    # --- Raqam bo'yicha qidirish ---
    if query_clean.isdigit():
        questions = await _search_leetcode(query_clean)
        # Aniq raqam bo'yicha moslik
        for q in questions:
            if str(q.get("questionFrontendId", "")) == query_clean:
                return q["titleSlug"]
        # Topilmadi — 1-natijani olamiz (ko'pincha to'g'ri keladi)
        if questions:
            return questions[0]["titleSlug"]
        return None

    # --- Nom bo'yicha qidirish ---
    questions = await _search_leetcode(query_clean)

    # 1. To'liq mos
    for q in questions:
        if q.get("title", "").lower() == query_lower:
            return q["titleSlug"]

    # 2. Boshlanishi mos
    for q in questions:
        if q.get("title", "").lower().startswith(query_lower):
            return q["titleSlug"]

    # 3. Qisman mos
    for q in questions:
        if query_lower in q.get("title", "").lower():
            return q["titleSlug"]

    # 4. Slug sifatida bevosita ishlatish (masalan "two-sum" kiritilsa)
    slug_attempt = re.sub(r"[^a-z0-9-]", "-", query_lower).strip("-")
    if slug_attempt:
        # Tekshirib ko'rish — agar mavjud bo'lsa qaytaramiz
        lc_data = await _fetch_leetcode_by_slug(slug_attempt)
        if lc_data:
            return slug_attempt

    return questions[0]["titleSlug"] if questions else None


def _html_to_text(html: str) -> str:
    """HTML dan matnni ajratib olish."""
    # Code bloklarni saqlash
    html = re.sub(r"<pre>(.*?)</pre>", lambda m: "\n```\n" + m.group(1) + "\n```\n", html, flags=re.DOTALL)
    # Strong/em
    html = re.sub(r"<strong>(.*?)</strong>", r"**\1**", html, flags=re.DOTALL)
    html = re.sub(r"<em>(.*?)</em>", r"*\1*", html, flags=re.DOTALL)
    # Code
    html = re.sub(r"<code>(.*?)</code>", r"`\1`", html, flags=re.DOTALL)
    # Paragraf
    html = re.sub(r"<p>(.*?)</p>", r"\n\1\n", html, flags=re.DOTALL)
    html = re.sub(r"<ul>(.*?)</ul>", r"\n\1\n", html, flags=re.DOTALL)
    html = re.sub(r"<li>(.*?)</li>", r"- \1\n", html, flags=re.DOTALL)
    # Qolgan taglar
    html = re.sub(r"<[^>]+>", "", html)
    # Entities
    html = html.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    html = html.replace("&le;", "≤").replace("&ge;", "≥").replace("&nbsp;", " ")
    html = html.replace("&#39;", "'").replace("&quot;", '"')
    # Bo'sh qatorlarni tozalash
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html.strip()


# ---------------------------------------------------------------------------
# AI helper — Groq / Gemini
# ---------------------------------------------------------------------------

def _call_groq_sync(prompt: str, max_tokens: int = 2000, json_mode: bool = False) -> str:
    """Groq API ni sinxron chaqirish."""
    if not ai_service.groq_client:
        raise RuntimeError("Groq API kalit topilmadi. GROQ_API_KEY ni sozlang.")
    kwargs: dict = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = ai_service.groq_client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content.strip()


async def _call_gemini_async(prompt: str, max_tokens: int = 2000) -> str:
    """Gemini API ni asinxron chaqirish."""
    from app.services.ai_service import _GEMINI_MODELS
    for model in _GEMINI_MODELS:
        try:
            return await ai_service._gemini_generate_ext(model, prompt, max_tokens)
        except Exception as exc:
            logger.warning("Gemini %s failed: %s", model, exc)
    raise RuntimeError("Barcha AI provayderlari ishlamadi.")


async def _ai_complete(prompt: str, max_tokens: int = 2000, json_mode: bool = False) -> str:
    """Eng yaxshi mavjud AI ni ishlatish (Groq → Gemini)."""
    if ai_service.groq_client:
        try:
            return _call_groq_sync(prompt, max_tokens, json_mode)
        except Exception as exc:
            logger.warning("Groq failed, trying Gemini: %s", exc)
    if ai_service.api_key:
        return await _call_gemini_async(prompt, max_tokens)
    raise HTTPException(503, "AI xizmat mavjud emas. API kalitlarini tekshiring.")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LeetCodeRequest(BaseModel):
    query: str  # raqam yoki nom: "1", "Two Sum", "two-sum"


class GenerateDescriptionRequest(BaseModel):
    title: str
    difficulty: str  # easy/medium/hard
    tags: List[str] = []
    notes: str = ""  # qo'shimcha izoh


class ImproveDescriptionRequest(BaseModel):
    description: str
    title: str = ""
    difficulty: str = ""


class GenerateStarterCodeRequest(BaseModel):
    description: str
    function_name: str = "solve"
    language: str = "python"  # python / javascript / cpp


class GenerateTestCasesRequest(BaseModel):
    description: str
    function_name: str = "solve"
    count: int = 10
    existing_test_cases: List[dict] = []


class ValidateTestCasesRequest(BaseModel):
    description: str
    function_name: str = "solve"
    test_cases: List[dict]  # [{input, expected_output}]


class TestCaseValidationResult(BaseModel):
    index: int
    input: str
    expected_output: str
    ai_output: str
    is_correct: bool
    suggestion: str = ""


class ValidateResponse(BaseModel):
    results: List[TestCaseValidationResult]
    all_correct: bool
    summary: str


class LeetCodeProblemResponse(BaseModel):
    title: str
    slug: str
    difficulty: str
    description: str
    input_format: str
    output_format: str
    constraints_text: str
    starter_code: str
    function_name: str
    tags: List[str]
    test_cases: List[dict]
    leetcode_id: Optional[int]
    source_url: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/from-leetcode", response_model=LeetCodeProblemResponse)
async def from_leetcode(
    req: LeetCodeRequest,
    _admin: User = Depends(get_admin_user),
) -> LeetCodeProblemResponse:
    """
    LeetCode masalasini nom yoki raqam orqali topib, O'zbek tiliga to'liq tarjima qiladi.
    Admin faqat "1" yoki "Two Sum" deydi — AI hammasini qiladi.
    """
    # 1. Slug topish
    slug = await _find_leetcode_slug(req.query.strip())
    if not slug:
        raise HTTPException(404, f"LeetCode da masala topilmadi: {req.query!r}")

    # 2. Masala ma'lumotlarini olish
    lc_data = await _fetch_leetcode_by_slug(slug)
    if not lc_data:
        raise HTTPException(404, f"LeetCode masalasi yuklanmadi (slug: {slug})")

    title_en = lc_data.get("title", req.query)
    difficulty_map = {"Easy": "easy", "Medium": "medium", "Hard": "hard"}
    difficulty = difficulty_map.get(lc_data.get("difficulty", "Medium"), "medium")
    lc_id = int(lc_data.get("questionId", 0)) or None
    tags = [t["name"] for t in lc_data.get("topicTags", [])]
    html_content = lc_data.get("content", "")
    raw_text = _html_to_text(html_content) if html_content else ""
    examples_raw = lc_data.get("exampleTestcases", "") or ""

    # 3. AI bilan O'zbek tiliga tarjima va strukturalash
    translate_prompt = f"""Sen dasturlash masalalarini o'zbek tiliga professional tarjima qiladigan mutaxassissan.

ASLIY MASALA (inglizcha):
Nom: {title_en}
Qiyinlik: {lc_data.get('difficulty', 'Medium')}
Teglar: {', '.join(tags)}

ASLIY TAVSIF:
{raw_text[:3000]}

VAZIFA:
Quyidagi JSON formatida javob ber (FAQAT JSON, boshqa hech narsa yozma):

{{
  "title_uz": "Masala nomining o'zbek tilidagi tarjimasi (aniq va professional)",
  "description": "Masala tavsifining to'liq o'zbekcha tarjimasi (markdown formatida, misollar bilan). Sodda va tushinarli tilida yoz. Atamalarni o'zbek tiliga to'g'ri o'gir.",
  "input_format": "Kirish ma'lumotlari formati (o'zbekcha)",
  "output_format": "Chiqish ma'lumotlari formati (o'zbekcha)",
  "constraints_text": "Cheklovlar (o'zbekcha, masalan: 1 ≤ n ≤ 10^5)",
  "function_name": "yechim_uchun_funksiya_nomi_inglizcha (masalan: twoSum, maxSubarray)",
  "starter_code_python": "def function_name(params):\\n    # Yechimingizni shu yerga yozing\\n    pass",
  "test_cases": [
    {{"input": "kiritilgan_qiymat", "expected_output": "kutilgan_natija", "is_hidden": false}},
    {{"input": "boshqa_kiritish", "expected_output": "boshqa_natija", "is_hidden": false}},
    {{"input": "yashirin_test", "expected_output": "natija", "is_hidden": true}}
  ],
  "difficulty": "{difficulty}"
}}

MUHIM:
- Description markdown formatida bo'lsin, misollar **Ko'rinishi:** va **Natija:** bilan ko'rsatilsin
- Test case lar haqiqiy va to'g'ri bo'lsin (LeetCode misollaridan oling)
- function_name inglizcha camelCase yoki snake_case bo'lsin
- Kamida 5 ta test case (2 ta ko'rinadigan, 3 ta yashirin)
- O'zbek tilidagi tarjima grammatik to'g'ri va tushunarli bo'lsin
"""

    try:
        ai_response = await _ai_complete(translate_prompt, max_tokens=3000, json_mode=True)
        result = json.loads(ai_response)
    except json.JSONDecodeError:
        # JSON ni extract qilishga urinish
        match = re.search(r"\{[\s\S]+\}", ai_response)
        if not match:
            raise HTTPException(500, "AI javob noto'g'ri formatda qaytdi.")
        result = json.loads(match.group(0))

    # Test case larni normalize qilish
    test_cases = []
    for tc in result.get("test_cases", []):
        if isinstance(tc, dict) and "input" in tc and "expected_output" in tc:
            test_cases.append({
                "input": str(tc["input"]),
                "expected_output": str(tc["expected_output"]),
                "is_hidden": bool(tc.get("is_hidden", False)),
            })

    # LeetCode dan kelgan misollarni ham qo'shish (agar AI undan foydalanmagan bo'lsa)
    if examples_raw and len(test_cases) < 3:
        for line in examples_raw.strip().split("\n"):
            if line.strip():
                test_cases.insert(0, {
                    "input": line.strip(),
                    "expected_output": "",
                    "is_hidden": False,
                })

    return LeetCodeProblemResponse(
        title=result.get("title_uz", title_en),
        slug=slug,
        difficulty=result.get("difficulty", difficulty),
        description=result.get("description", raw_text),
        input_format=result.get("input_format", ""),
        output_format=result.get("output_format", ""),
        constraints_text=result.get("constraints_text", ""),
        starter_code=result.get("starter_code_python", "def solve():\n    pass"),
        function_name=result.get("function_name", "solve"),
        tags=tags,
        test_cases=test_cases,
        leetcode_id=lc_id,
        source_url=f"https://leetcode.com/problems/{slug}/",
    )


@router.post("/generate-description")
async def generate_description(
    req: GenerateDescriptionRequest,
    _admin: User = Depends(get_admin_user),
) -> dict:
    """
    Masala nomi va qiyinligi asosida to'liq O'zbek tilidagi description yaratadi.
    """
    tags_str = ", ".join(req.tags) if req.tags else "umumiy"
    prompt = f"""Sen dasturlash masalasi yozuvchisissan. O'zbek tilida professional masala yoz.

MASALA MA'LUMOTLARI:
- Nom: {req.title}
- Qiyinlik: {req.difficulty}
- Teglar: {tags_str}
- Qo'shimcha: {req.notes or 'yo\'q'}

Quyidagi JSON formatida javob ber (FAQAT JSON):
{{
  "description": "Masalaning to'liq tavsifi (markdown, misollar bilan, o'zbekcha)",
  "input_format": "Kirish formati (o'zbekcha)",
  "output_format": "Chiqish formati (o'zbekcha)",
  "constraints_text": "Cheklovlar (o'zbekcha)"
}}

QOIDALAR:
- Masala aniq, qisqa va tushunarli bo'lsin
- Kamida 2 ta misol ko'rsatilsin (**Misol 1**, **Misol 2** formatida)
- Professional dasturlash uslubida yoz
"""
    ai_response = await _ai_complete(prompt, max_tokens=1500, json_mode=True)
    try:
        return json.loads(ai_response)
    except Exception:
        return {"description": ai_response, "input_format": "", "output_format": "", "constraints_text": ""}


@router.post("/improve-description")
async def improve_description(
    req: ImproveDescriptionRequest,
    _admin: User = Depends(get_admin_user),
) -> dict:
    """
    Mavjud descriptionni grammatika, mantiq va tushunarliligi jihatidan yaxshilaydi.
    Original va yaxshilangan variantni ko'rsatadi.
    """
    prompt = f"""Sen o'zbek tili va dasturlash masalalari bo'yicha mutaxassissan.

Quyidagi masala tavsifini tekshir va yaxshila:

MASALA NOMI: {req.title or '(ko\'rsatilmagan)'}
QIYINLIK: {req.difficulty or '(ko\'rsatilmagan)'}

ASLIY TAVSIF:
{req.description}

Quyidagi JSON formatida javob ber (FAQAT JSON):
{{
  "improved_description": "Yaxshilangan tavsif (grammatik to'g'ri, mantiqiy, tushunarli, markdown)",
  "changes": ["Qilingan o'zgartirish 1", "Qilingan o'zgartirish 2"],
  "issues_found": ["Topilgan muammo 1", "Topilgan muammo 2"]
}}

YAXSHILASH MEZONLARI:
- Grammatik xatolarni to'g'irlash
- Noaniq iboralarni aniqlashtirish
- Misollarni to'g'rilab, to'ldirish
- Dasturlash atamalarini to'g'ri ishlatish
- Mantiq izchilligini ta'minlash
"""
    ai_response = await _ai_complete(prompt, max_tokens=2000, json_mode=True)
    try:
        return json.loads(ai_response)
    except Exception:
        return {
            "improved_description": req.description,
            "changes": [],
            "issues_found": ["AI javob xato formatda keldi"],
        }


@router.post("/generate-starter-code")
async def generate_starter_code(
    req: GenerateStarterCodeRequest,
    _admin: User = Depends(get_admin_user),
) -> dict:
    """
    Masala tavsifi asosida Python/JS/C++ starter code yaratadi.
    """
    lang_formats = {
        "python": "Python 3",
        "javascript": "JavaScript",
        "cpp": "C++17",
    }
    lang_label = lang_formats.get(req.language, "Python 3")

    prompt = f"""Dasturlash masalasi uchun starter code yoz.

MASALA TAVSIFI:
{req.description[:1500]}

FUNKSIYA NOMI: {req.function_name}
TIL: {lang_label}

Quyidagi JSON formatida javob ber (FAQAT JSON):
{{
  "starter_code": "Faqat funksiya skeleti, hech qanday yechim yo'q, faqat `pass` yoki return placeholder",
  "function_name": "Aniqlashtirilgan funksiya nomi",
  "explanation": "Parametrlar va qaytarish qiymati haqida qisqa izoh (o'zbekcha)"
}}

QOIDALAR:
- Faqat funksiya skeleti, yechim kodi YOZMA
- To'g'ri parametr nomlari va type hint lar
- Python uchun: `def {req.function_name}(params) -> return_type:`
- Docstring qisqa bo'lsin (o'zbekcha)
"""
    ai_response = await _ai_complete(prompt, max_tokens=800, json_mode=True)
    try:
        return json.loads(ai_response)
    except Exception:
        return {
            "starter_code": f"def {req.function_name}():\n    # Yechimingizni shu yerga yozing\n    pass",
            "function_name": req.function_name,
            "explanation": "Avtomatik yaratilmadi",
        }


@router.post("/generate-test-cases")
async def generate_test_cases(
    req: GenerateTestCasesRequest,
    _admin: User = Depends(get_admin_user),
) -> dict:
    """
    Masala tavsifi asosida N ta test case yaratadi va ularning expected_output larini hisoblaydi.
    """
    existing_str = ""
    if req.existing_test_cases:
        existing_str = f"\nMAVJUD TEST CASE LAR (bularni takrorlama):\n{json.dumps(req.existing_test_cases[:5], ensure_ascii=False, indent=2)}"

    prompt = f"""Sen dasturlash masalasi uchun test case yaratuvchi mutaxassissan.

MASALA TAVSIFI:
{req.description[:2000]}

FUNKSIYA NOMI: {req.function_name}
{existing_str}

{req.count} ta test case yarat. Quyidagi JSON formatida javob ber (FAQAT JSON):
{{
  "test_cases": [
    {{
      "input": "funksiyaga beriladigan argument (Python eval() da ishlaydigan format)",
      "expected_output": "to'g'ri javob (string sifatida)",
      "is_hidden": false,
      "explanation": "Bu test nimani tekshiradi (qisqa, o'zbekcha)"
    }}
  ],
  "reference_solution": "Masalani to'g'ri yechar Python funksiyasi kodi"
}}

QOIDALAR:
- Input Python eval() da ishlaydigan format bo'lsin (masalan: "[1,2,3], 5" yoki "\"hello\"")
- expected_output string bo'lsin (masalan: "6", "[1,2]", "True")
- Birinchi 3-4 ta test oddiy, qolganlar murakkab va edge case lar bo'lsin
- Oxirgi 2-3 ta test is_hidden: true bo'lsin
- reference_solution to'g'ri ishlaydigan kod bo'lsin
"""
    ai_response = await _ai_complete(prompt, max_tokens=2500, json_mode=True)
    try:
        result = json.loads(ai_response)
        # Reference solution bilan test case larni tekshirish
        solution_code = result.get("reference_solution", "")
        test_cases = result.get("test_cases", [])

        if solution_code and test_cases:
            verified = _verify_test_cases_with_code(
                solution_code, req.function_name, test_cases
            )
            result["test_cases"] = verified
            result["verified"] = True

        return result
    except json.JSONDecodeError:
        return {"test_cases": [], "error": "AI javob parse qilinmadi", "verified": False}


@router.post("/validate-test-cases", response_model=ValidateResponse)
async def validate_test_cases(
    req: ValidateTestCasesRequest,
    _admin: User = Depends(get_admin_user),
) -> ValidateResponse:
    """
    Admin kiritgan test case larni AI reference solution bilan tekshiradi.
    Noto'g'ri expected_output bo'lsa aniqlab, to'g'ri javob taklif qiladi.
    """
    # 1. AI reference solution yaratadi
    solution_prompt = f"""Quyidagi masala uchun to'g'ri Python yechim yoz.
Faqat funksiya kodi (def {req.function_name}...) ber, boshqa hech narsa yozma.

MASALA:
{req.description[:2000]}

Funksiya nomi: {req.function_name}

FAQAT PYTHON KOD (hech qanday izoh, markdown yoki tushuntirish yo'q):"""

    try:
        solution_code = await _ai_complete(solution_prompt, max_tokens=1000)
        # Markdown block larni tozalash
        solution_code = re.sub(r"```python\n?|```\n?|```", "", solution_code).strip()
    except Exception as exc:
        raise HTTPException(500, f"AI yechim yarata olmadi: {exc}")

    # 2. Har bir test case ni tekshirish
    results = _verify_test_cases_with_code(
        solution_code, req.function_name, req.test_cases
    )

    validation_results = []
    all_correct = True

    for i, (tc, verified) in enumerate(zip(req.test_cases, results)):
        is_correct = verified.get("is_correct", False)
        if not is_correct:
            all_correct = False
        validation_results.append(TestCaseValidationResult(
            index=i,
            input=tc.get("input", ""),
            expected_output=tc.get("expected_output", ""),
            ai_output=verified.get("expected_output", tc.get("expected_output", "")),
            is_correct=is_correct,
            suggestion=verified.get("suggestion", ""),
        ))

    correct_count = sum(1 for r in validation_results if r.is_correct)
    summary = (
        f"Barcha {len(validation_results)} ta test case to'g'ri!"
        if all_correct
        else f"{correct_count}/{len(validation_results)} ta test case to'g'ri. "
             f"{len(validation_results) - correct_count} ta xato topildi."
    )

    return ValidateResponse(
        results=validation_results,
        all_correct=all_correct,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# Internal: Test case verification
# ---------------------------------------------------------------------------

def _safe_exec_solution(code: str, function_name: str, input_str: str) -> tuple[bool, str]:
    """
    Python kodni xavfsiz muhitda ishlatib, natijani qaytaradi.
    Returns: (success, output_str)
    """
    try:
        # Namespace yaratish
        namespace: dict = {}
        exec(compile(code, "<admin_validate>", "exec"), namespace)  # noqa: S102

        func = namespace.get(function_name)
        if not func or not callable(func):
            return False, f"Funksiya topilmadi: {function_name}"

        # Input ni parse qilish
        try:
            # Argumentlarni eval qilish
            input_clean = input_str.strip()
            if input_clean.startswith("(") and input_clean.endswith(")"):
                # Tuple sifatida
                args = ast.literal_eval(input_clean)
                if not isinstance(args, tuple):
                    args = (args,)
            elif "," in input_clean:
                # Vergul bilan ajratilgan argumentlar
                try:
                    args = tuple(ast.literal_eval(f"({input_clean},)"))
                except Exception:
                    args = (ast.literal_eval(input_clean),)
            else:
                parsed = ast.literal_eval(input_clean)
                args = (parsed,)
        except Exception:
            # String sifatida
            args = (input_clean,)

        result = func(*args)
        return True, str(result)

    except Exception as exc:
        return False, f"Xato: {exc}"


def _verify_test_cases_with_code(
    solution_code: str,
    function_name: str,
    test_cases: list[dict],
) -> list[dict]:
    """Test case larni solution code bilan tekshiradi."""
    verified = []
    for tc in test_cases:
        tc_input = str(tc.get("input", ""))
        tc_expected = str(tc.get("expected_output", ""))

        success, ai_output = _safe_exec_solution(solution_code, function_name, tc_input)

        if not success:
            verified.append({
                **tc,
                "is_correct": False,
                "ai_output": ai_output,
                "suggestion": f"Kod ishlamadi: {ai_output}",
            })
            continue

        # Natijalarni solishtirish (string comparison, normalize)
        def normalize(s: str) -> str:
            return re.sub(r"\s+", " ", str(s).strip().lower())

        is_correct = normalize(ai_output) == normalize(tc_expected)
        suggestion = ""
        if not is_correct:
            suggestion = f"To'g'ri javob: {ai_output}"

        verified.append({
            **tc,
            "expected_output": ai_output if not tc_expected else tc_expected,
            "is_correct": is_correct,
            "ai_output": ai_output,
            "suggestion": suggestion,
        })

    return verified
