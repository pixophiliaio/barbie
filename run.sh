#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Select Python environment
if [ -f "/Users/uttkarsh/Desktop/wrkspce2/.venv/bin/python3" ]; then
    PYTHON="/Users/uttkarsh/Desktop/wrkspce2/.venv/bin/python3"
elif [ -n "$VIRTUAL_ENV" ]; then
    PYTHON="$VIRTUAL_ENV/bin/python"
elif which python3 > /dev/null 2>&1; then
    PYTHON="python3"
else
    echo "Error: Python 3 not found"
    exit 1
fi

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "=========================================================="
echo " Starting 3D Body & Image Pose Visualizer"
echo " URL: http://${HOST}:${PORT}"
echo " Python: ${PYTHON}"
echo "=========================================================="

exec "$PYTHON" -m uvicorn backend.app:app --host "$HOST" --port "$PORT" --reload
