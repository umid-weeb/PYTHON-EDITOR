import sys
import os

filepath = 'd:/Projects/PYTHON-EDITOR/arena/src/lib/apiClient.js'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('export const API_BASE_URL =')
if idx != -1:
    new_code = """let resolvedBase = String(import.meta.env.VITE_ARENA_API_BASE ?? DEFAULT_API_BASE).replace(/\\/+$/, "");
if (!import.meta.env.DEV && (resolvedBase === "" || resolvedBase.includes("localhost") || resolvedBase.includes("127.0.0.1"))) {
  resolvedBase = "http://16.16.26.138:5000";
}
export const API_BASE_URL = resolvedBase;
"""
    # Replace the old `export const API_BASE_URL = ...` segment
    text = text[:idx] + new_code + text[idx+93:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Muvaffaqiyatli saqlandi!")
else:
    print("API_BASE_URL topilmadi.")
