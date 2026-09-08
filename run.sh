#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Select Python environment
if [ -f "$DIR/.venv/bin/python" ]; then
    PYTHON="$DIR/.venv/bin/python"
elif [ -f "$DIR/venv/bin/python" ]; then
    PYTHON="$DIR/venv/bin/python"
elif [ -n "$VIRTUAL_ENV" ] && [ -f "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON="$VIRTUAL_ENV/bin/python"
elif [ -f "/Users/uttkarsh/Desktop/wrkspce2/.venv/bin/python3" ]; then
    PYTHON="/Users/uttkarsh/Desktop/wrkspce2/.venv/bin/python3"
elif which python3 > /dev/null 2>&1; then
    PYTHON="python3"
else
    echo "Error: Python 3 not found"
    exit 1
fi

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "=========================================================="
echo " Starting 3D Body & Image Pose Visualizer"
echo " Local URL: http://127.0.0.1:${PORT}"
echo " Host URL:  http://localhost:${PORT}"
echo " Python:    ${PYTHON}"
echo "=========================================================="

exec "$PYTHON" -m uvicorn backend.app:app --host "$HOST" --port "$PORT" --reload
