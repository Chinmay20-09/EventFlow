#!/usr/bin/env bash
# ============================================================================
# EventFlow P3 — run the FastAPI backend against PostgreSQL
#
# Usage:
#   bash backend/run_backend.sh              # normal start (reads backend/.env)
#   bash backend/run_backend.sh --reload     # auto-reload on code changes
#   API_PORT=9000 bash backend/run_backend.sh
#
# What it does:
#   1. Uses the backend virtualenv (backend/.venv)
#   2. Pre-flight check: DATABASE_URL configured + PostgreSQL reachable
#      (SELECT 1 — never prints the password)
#   3. Starts uvicorn; the app itself loads backend/.env and creates tables
#      at startup (app.main lifespan → Base.metadata.create_all)
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"   # always run from backend/

if [[ ! -f ".env" ]]; then
  echo "NOTE: backend/.env not found. Copy .env.example to .env and set DATABASE_URL."
fi

# --- 1. Pick the virtualenv python -------------------------------------------
if [[ -x ".venv/Scripts/python.exe" ]]; then
  PY=".venv/Scripts/python.exe"          # Windows venv layout
elif [[ -x ".venv/bin/python" ]]; then
  PY=".venv/bin/python"                  # Linux/macOS venv layout
else
  echo "ERROR: backend/.venv not found." >&2
  echo "       Create it and install requirements.txt first:" >&2
  echo "         python -m venv .venv" >&2
  echo "         .venv/Scripts/python -m pip install -r requirements.txt   # Windows" >&2
  echo "         .venv/bin/python -m pip install -r requirements.txt       # Linux/macOS" >&2
  exit 1
fi

# --- 2. Pre-flight: config + PostgreSQL connectivity (SELECT 1) --------------
# Prints host/port/db/user for diagnosis but NEVER the password or full DSN.
"$PY" - <<'PYEOF'
from urllib.parse import urlsplit

from sqlalchemy import create_engine, text

from app.core.config import settings

if not settings.database_url:
    raise SystemExit(
        "ERROR: DATABASE_URL is not configured.\n"
        "       Copy backend/.env.example to backend/.env and set DATABASE_URL."
    )

p = urlsplit(settings.database_url)
print(
    f"==> PostgreSQL target: {p.hostname}:{p.port or 5432}/{p.path.lstrip('/')}"
    f" (user: {p.username})"
)

kwargs = {"connect_args": {"connect_timeout": 5}} if p.scheme.startswith("postgres") else {}
try:
    engine = create_engine(settings.database_url, **kwargs)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
except Exception as exc:
    print(f"==> PostgreSQL: FAILED ({type(exc).__name__})")
    print("    Is PostgreSQL running and reachable? Check DATABASE_URL in backend/.env.")
    raise SystemExit(1)
print("==> PostgreSQL: OK (SELECT 1 passed)")
PYEOF

# --- 3. Start the API ---------------------------------------------------------
HOST="${API_HOST:-0.0.0.0}"
PORT="${API_PORT:-8000}"
echo "==> Starting EventFlow P3 backend: http://localhost:$PORT  (docs: http://localhost:$PORT/docs)"
exec "$PY" -m uvicorn app.main:app --host "$HOST" --port "$PORT" "$@"
