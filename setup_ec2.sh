#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# setup_ec2.sh — One-time setup for a fresh EC2 instance.
#
# Run this ONCE after cloning the repo on EC2.
# It installs system deps, Python venv, Node modules, and builds the frontend.
#
# Usage:
#   1. Clone repo and cd into feedback-platform/
#   2. Copy .env.example → .env and fill in your real credentials
#   3. Run: bash setup_ec2.sh
#   4. Start services: ./start.sh   (or ./restart_services.sh)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 0. Pre-flight: .env must exist ──────────────────────────────────────────
if [ ! -f .env ]; then
  echo "ERROR: .env not found."
  echo "  cp .env.example .env   # then fill in your credentials"
  exit 1
fi

# Load env vars (needed for REACT_APP_API_BASE at build time)
set -a; source .env; set +a

# ── 1. System dependencies (Amazon Linux 2 / Ubuntu) ───────────────────────
echo "==> Installing system packages ..."
if command -v yum &>/dev/null; then
  sudo yum install -y python3 python3-pip nodejs npm git
elif command -v apt-get &>/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y python3 python3-pip python3-venv nodejs npm git
fi

# ── 2. Python virtual environment + deps ───────────────────────────────────
echo "==> Setting up Python venv ..."
cd "$SCRIPT_DIR/backend"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd "$SCRIPT_DIR"

# ── 3. Node modules + production build ─────────────────────────────────────
echo "==> Installing frontend dependencies ..."
cd "$SCRIPT_DIR/frontend"
npm install

echo "==> Building frontend for production ..."
# REACT_APP_API_BASE is read from .env (sourced above).
# If not set, it falls back to http://localhost:8081/api via config.js.
REACT_APP_API_BASE="${REACT_APP_API_BASE:-http://localhost:8081/api}" npm run build

cd "$SCRIPT_DIR"

# ── 4. Install 'serve' globally for serving the static build ───────────────
echo "==> Installing 'serve' for static file serving ..."
sudo npm install -g serve

echo ""
echo "========================================="
echo " Setup complete!"
echo "========================================="
echo ""
echo " To start services:"
echo "   ./start.sh"
echo ""
echo " To restart services:"
echo "   ./restart_services.sh"
echo ""
echo " Backend  → http://0.0.0.0:${BACKEND_PORT:-8081}"
echo " Frontend → http://0.0.0.0:${FRONTEND_PORT:-3011}"
echo ""
