#!/usr/bin/env bash
# ==============================================================================
# Barbie 3D Body & Pose Visualizer - WSL Run Script
# Runs FastAPI/Uvicorn server bound to 0.0.0.0 for seamless Windows browser access
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 1. Select Python environment
if [ -f "$DIR/.venv/bin/python" ]; then
    PYTHON="$DIR/.venv/bin/python"
elif [ -f "$DIR/venv/bin/python" ]; then
    PYTHON="$DIR/venv/bin/python"
elif [ -n "$VIRTUAL_ENV" ] && [ -f "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON="$VIRTUAL_ENV/bin/python"
elif which python3 > /dev/null 2>&1; then
    PYTHON="python3"
else
    echo "[!] Error: Python virtual environment not found."
    echo "    Please run ./install_wsl.sh first to set up the environment."
    exit 1
fi

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "=========================================================="
echo " Starting Barbie 3D Body & Pose Visualizer (WSL)"
echo "=========================================================="
echo " Python:     $PYTHON"
echo " Host:       $HOST"
echo " Port:       $PORT"
echo ""
echo " Access URLs from your Windows Browser:"
echo "   Annotator Studio:  http://localhost:${PORT}/"
echo "   Admin Studio:      http://localhost:${PORT}/admin"
echo ""
echo " WSL Internal URL:    http://127.0.0.1:${PORT}/"
echo ""
echo " Windows Path Tip:"
echo "   You can paste Windows paths directly (e.g. C:\\dataset\\model_01)"
echo "   or use WSL mount paths (e.g. /mnt/c/dataset/model_01)"
echo "=========================================================="
echo " Press Ctrl+C to stop the server."
echo "=========================================================="

exec "$PYTHON" -m uvicorn backend.app:app --host "$HOST" --port "$PORT" --reload
