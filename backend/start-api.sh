#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

if [ -x "$REPO_ROOT/venv/bin/python" ]; then
  PYTHON="$REPO_ROOT/venv/bin/python"
elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
  PYTHON="$REPO_ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  PYTHON="$(command -v python)"
fi

export PYTHONUNBUFFERED=1
export PORT="${PORT:-8000}"

cd "$BACKEND_DIR"
exec "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
