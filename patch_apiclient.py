import sys

with open('d:/Projects/PYTHON-EDITOR/arena/src/lib/apiClient.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Replace lines 6 to 11
new_lines = [
    'const DEFAULT_API_BASE = import.meta.env.DEV ? "http://127.0.0.1:8000" : "http://16.16.26.138:5000";\n',
    '\n',
    'let resolvedBase = String(\n',
    '  import.meta.env.VITE_ARENA_API_BASE ?? DEFAULT_API_BASE\n',
    ').replace(/\\/+$/, "");\n',
    '\n',
    'if (!import.meta.env.DEV && (resolvedBase === "" || resolvedBase.includes("localhost") || resolvedBase.includes("127.0.0.1"))) {\n',
    '  resolvedBase = "http://16.16.26.138:5000";\n',
    '}\n',
    '\n',
    'export const API_BASE_URL = resolvedBase;\n'
]

lines[6:11] = new_lines

with open('d:/Projects/PYTHON-EDITOR/arena/src/lib/apiClient.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
