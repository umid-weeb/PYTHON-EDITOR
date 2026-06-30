"""
Language-agnostic starter-code (stub) generator.

A problem stores ONE language-agnostic *signature spec*:

    {
      "function_name": "twoSum",
      "params": [
        {"name": "nums", "type": "int[]"},
        {"name": "target", "type": "int"}
      ],
      "returns": {"type": "int[]"}
    }

From that single source of truth this module deterministically renders the
per-language starter stub shown in the editor (LeetCode style). Execution of
non-Python languages is wired later via Judge0; this module only produces the
*display* stub plus, where relevant, the per-language type declarations a
driver/harness will reuse.

Supported abstract types (Phase 1):
    scalars : int, long, float, double, bool, string, char, void
    arrays  : <scalar>[]   (1D)   e.g. int[]
              <scalar>[][] (2D)   e.g. int[][]

Unknown types fall back to a language-appropriate "object" placeholder and the
caller may flag the stub for manual override.
"""
from __future__ import annotations

import re
from typing import Any

# Programming languages we generate stubs for. SQL is handled separately
# (SQL problems ship a query template, not a function stub).
SUPPORTED_LANGUAGES: tuple[str, ...] = (
    "python",
    "javascript",
    "typescript",
    "java",
    "cpp",
    "c",
    "csharp",
    "go",
)

INDENT = "    "


# --------------------------------------------------------------------------- #
# Type parsing
# --------------------------------------------------------------------------- #
_TYPE_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*((?:\[\s*\])*)\s*$")


def parse_type(raw: str) -> tuple[str, int]:
    """Return (base_type, array_dimensions). 'int[][]' -> ('int', 2)."""
    if not raw:
        return ("void", 0)
    # Normalise common aliases (Python/TS spellings) to the abstract base.
    text = str(raw).strip()
    alias = {
        "integer": "int",
        "number": "int",
        "str": "string",
        "boolean": "bool",
        "double": "float",
        "float64": "float",
        "list[int]": "int[]",
        "list[str]": "string[]",
        "list[float]": "float[]",
        "list[list[int]]": "int[][]",
    }
    lowered = text.lower()
    if lowered in alias:
        text = alias[lowered]
    match = _TYPE_RE.match(text)
    if not match:
        return (text, 0)
    base = match.group(1).lower()
    dims = match.group(2).count("[")
    base = {"integer": "int", "number": "int", "str": "string", "boolean": "bool", "double": "float"}.get(base, base)
    return (base, dims)


# Per-language scalar spellings. Arrays are built on top of these.
_SCALAR: dict[str, dict[str, str]] = {
    "python":     {"int": "int", "long": "int", "float": "float", "bool": "bool", "string": "str", "char": "str", "void": "None"},
    "typescript": {"int": "number", "long": "number", "float": "number", "bool": "boolean", "string": "string", "char": "string", "void": "void"},
    "java":       {"int": "int", "long": "long", "float": "double", "bool": "boolean", "string": "String", "char": "char", "void": "void"},
    "cpp":        {"int": "int", "long": "long", "float": "double", "bool": "bool", "string": "string", "char": "char", "void": "void"},
    "csharp":     {"int": "int", "long": "long", "float": "double", "bool": "bool", "string": "string", "char": "char", "void": "void"},
    "go":         {"int": "int", "long": "int64", "float": "float64", "bool": "bool", "string": "string", "char": "byte", "void": ""},
    "c":          {"int": "int", "long": "long", "float": "double", "bool": "bool", "string": "char*", "char": "char", "void": "void"},
    # JS uses JSDoc spellings (number/string/boolean), not real types.
    "javascript": {"int": "number", "long": "number", "float": "number", "bool": "boolean", "string": "string", "char": "string", "void": "void"},
}

_PLACEHOLDER = {
    "python": "object", "typescript": "any", "java": "Object", "cpp": "auto",
    "csharp": "object", "go": "interface{}", "c": "void*", "javascript": "*",
}


def _scalar(lang: str, base: str) -> str:
    return _SCALAR.get(lang, {}).get(base) or _PLACEHOLDER[lang]


# --------------------------------------------------------------------------- #
# Per-language declared-type rendering (used by stubs and future drivers)
# --------------------------------------------------------------------------- #
def render_type(lang: str, raw_type: str) -> str:
    base, dims = parse_type(raw_type)
    s = _scalar(lang, base)
    if dims == 0:
        return s
    if lang == "python":
        return ("List[" * dims) + s + ("]" * dims)
    if lang in ("typescript", "javascript", "java", "csharp"):
        return s + ("[]" * dims)
    if lang == "cpp":
        return ("vector<" * dims) + s + (">" * dims)
    if lang == "go":
        return ("[]" * dims) + s
    if lang == "c":
        return s + ("*" * dims)  # size params handled by the C renderer
    return s + ("[]" * dims)


# --------------------------------------------------------------------------- #
# Per-language stub renderers
# --------------------------------------------------------------------------- #
def _norm_spec(spec: dict[str, Any]) -> tuple[str, list[dict[str, str]], str]:
    fn = str(spec.get("function_name") or "solve").strip()
    params = [
        {"name": str(p.get("name") or f"arg{i}"), "type": str(p.get("type") or "int")}
        for i, p in enumerate(spec.get("params") or [])
    ]
    returns = spec.get("returns") or {}
    ret_type = str(returns.get("type") or "void") if isinstance(returns, dict) else str(returns or "void")
    return fn, params, ret_type


def _render_python(fn, params, ret):
    args = ", ".join(f"{p['name']}: {render_type('python', p['type'])}" for p in params)
    ret_hint = render_type("python", ret)
    head = "from typing import List, Optional\n\n"
    sig = f"    def {fn}(self, {args}) -> {ret_hint}:" if args else f"    def {fn}(self) -> {ret_hint}:"
    return f"{head}class Solution:\n{sig}\n        pass\n"


def _render_javascript(fn, params, ret):
    doc = ["/**"]
    for p in params:
        doc.append(f" * @param {{{render_type('javascript', p['type'])}}} {p['name']}")
    doc.append(f" * @return {{{render_type('javascript', ret)}}}")
    doc.append(" */")
    args = ", ".join(p["name"] for p in params)
    return "\n".join(doc) + f"\nvar {fn} = function({args}) {{\n    \n}};\n"


def _render_typescript(fn, params, ret):
    args = ", ".join(f"{p['name']}: {render_type('typescript', p['type'])}" for p in params)
    return f"function {fn}({args}): {render_type('typescript', ret)} {{\n    \n}};\n"


def _render_java(fn, params, ret):
    args = ", ".join(f"{render_type('java', p['type'])} {p['name']}" for p in params)
    return f"class Solution {{\n    public {render_type('java', ret)} {fn}({args}) {{\n        \n    }}\n}}\n"


def _render_cpp(fn, params, ret):
    parts = []
    for p in params:
        t = render_type("cpp", p["type"])
        # Pass containers/strings by reference, like LeetCode.
        _, dims = parse_type(p["type"])
        if dims > 0 or t == "string":
            parts.append(f"{t}& {p['name']}")
        else:
            parts.append(f"{t} {p['name']}")
    args = ", ".join(parts)
    return f"class Solution {{\npublic:\n    {render_type('cpp', ret)} {fn}({args}) {{\n        \n    }}\n}};\n"


def _render_csharp(fn, params, ret):
    args = ", ".join(f"{render_type('csharp', p['type'])} {p['name']}" for p in params)
    method = fn[:1].upper() + fn[1:]  # LeetCode capitalises C# method names
    return f"public class Solution {{\n    public {render_type('csharp', ret)} {method}({args}) {{\n        \n    }}\n}}\n"


def _render_go(fn, params, ret):
    args = ", ".join(f"{p['name']} {render_type('go', p['type'])}" for p in params)
    ret_t = render_type("go", ret)
    suffix = f" {ret_t}" if ret_t else ""
    return f"func {fn}({args}){suffix} {{\n    \n}}\n"


def _render_c(fn, params, ret):
    parts: list[str] = []
    for p in params:
        base, dims = parse_type(p["type"])
        if dims > 0:
            elem = _scalar("c", base)
            parts.append(f"{elem}* {p['name']}")
            parts.append(f"int {p['name']}Size")
        else:
            parts.append(f"{render_type('c', p['type'])} {p['name']}")
    _, ret_dims = parse_type(ret)
    note = ""
    if ret_dims > 0:
        parts.append("int* returnSize")
        ret_decl = f"{_scalar('c', parse_type(ret)[0])}*"
        note = "/**\n * Note: The returned array must be malloced, assume caller calls free().\n */\n"
    else:
        ret_decl = render_type("c", ret)
    args = ", ".join(parts)
    return f"{note}{ret_decl} {fn}({args}) {{\n    \n}}\n"


_RENDERERS = {
    "python": _render_python,
    "javascript": _render_javascript,
    "typescript": _render_typescript,
    "java": _render_java,
    "cpp": _render_cpp,
    "c": _render_c,
    "csharp": _render_csharp,
    "go": _render_go,
}


def generate_stub(spec: dict[str, Any], language: str) -> str:
    """Render the starter stub for a single language from a signature spec."""
    lang = str(language).strip().lower()
    if lang not in _RENDERERS:
        raise ValueError(f"Unsupported language: {language!r}")
    fn, params, ret = _norm_spec(spec)
    return _RENDERERS[lang](fn, params, ret)


def generate_all_stubs(spec: dict[str, Any]) -> dict[str, str]:
    """Render stubs for every supported language. Returns {language: code}."""
    return {lang: generate_stub(spec, lang) for lang in SUPPORTED_LANGUAGES}
