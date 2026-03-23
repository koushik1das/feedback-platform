#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stopping existing services..."
pkill -f "uvicorn api.main:app" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "serve -s build" 2>/dev/null || true
sleep 2

echo "Starting backend and frontend in background..."
nohup ./start.sh >> /tmp/feedback-services.log 2>&1 &
disown
echo "Done. Backend: http://localhost:8081 | Frontend: http://localhost:3011"
echo "Logs: /tmp/feedback-services.log"