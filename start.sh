#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# start.sh — launch backend (uvicorn) and frontend (serve) in the background.
#
# Reads BACKEND_PORT, FRONTEND_PORT, and REACT_APP_API_BASE from .env.
# Defaults: backend=8081, frontend=3011
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if present
if [ -f .env ]; then
  set -a; source .env; set +a
fi

BACKEND_PORT="${BACKEND_PORT:-8081}"
FRONTEND_PORT="${FRONTEND_PORT:-3011}"

echo "==> Starting backend on port $BACKEND_PORT ..."
cd "$SCRIPT_DIR/backend"
uvicorn api.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --workers 2 &
BACKEND_PID=$!

echo "==> Starting frontend on port $FRONTEND_PORT ..."
cd "$SCRIPT_DIR/frontend"
if [ -d build ]; then
  npx serve -s build -l "$FRONTEND_PORT" &
else
  echo "    (no build/ found — running dev server via npm start)"
  PORT="$FRONTEND_PORT" npm start &
fi
FRONTEND_PID=$!

echo ""
echo "Backend  : http://0.0.0.0:$BACKEND_PORT  (PID $BACKEND_PID)"
echo "Frontend : http://0.0.0.0:$FRONTEND_PORT  (PID $FRONTEND_PID)"
echo ""

# Wait for both; if either exits, bring down the other
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
