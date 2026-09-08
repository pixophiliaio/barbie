#!/usr/bin/env bash
# ==============================================================================
# Barbie 3D Body & Pose Visualizer - Full WSL Installation Script
# Compatible with Ubuntu/Debian on WSL / WSL2
# ==============================================================================
set -eo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Barbie 3D Body & Pose Visualizer - WSL Setup"
echo "  Target Directory: $DIR"
echo "=========================================================="

# 1. Check WSL environment
if grep -qi "microsoft" /proc/version 2>/dev/null || [ -n "$WSL_DISTRO_NAME" ]; then
    echo "[✓] Windows Subsystem for Linux (WSL) environment detected."
else
    echo "[i] Running in Linux environment."
fi

# 2. Update package lists and install required system libraries
echo ""
echo "--> [Step 1/5] Installing system packages & dependencies..."
if command -v apt-get &>/dev/null; then
    sudo apt-get update -y
    sudo apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        curl \
        git \
        build-essential
elif command -v dnf &>/dev/null; then
    sudo dnf install -y python3 python3-pip python3-devel mesa-libGL glib2 git curl gcc gcc-c++
elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm python python-pip base-devel mesa glib2
else
    echo "[!] Warning: Package manager not recognized. Please ensure python3, venv, libgl1, and libglib2.0-0 are installed."
fi

# 3. Create Python virtual environment
echo ""
echo "--> [Step 2/5] Creating Python virtual environment (.venv)..."
if [ ! -d "$DIR/.venv" ]; then
    python3 -m venv "$DIR/.venv"
    echo "[✓] Virtual environment created at $DIR/.venv"
else
    echo "[i] Existing virtual environment found at $DIR/.venv"
fi

# Activate virtual environment
source "$DIR/.venv/bin/activate"

# 4. Upgrade pip and build tools
echo ""
echo "--> [Step 3/5] Upgrading pip, setuptools, wheel..."
pip install --upgrade pip setuptools wheel

# 5. Install PyTorch (CUDA if GPU available, otherwise CPU)
echo ""
echo "--> [Step 4/5] Installing PyTorch & Torchvision..."
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
    echo "[✓] NVIDIA GPU detected via nvidia-smi! Installing PyTorch with CUDA support..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 || \
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121 || \
    pip install torch torchvision
else
    echo "[i] No NVIDIA GPU detected. Installing standard/CPU PyTorch..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu || \
    pip install torch torchvision
fi

# Install remaining requirements
echo ""
echo "--> [Step 5/5] Installing application requirements..."
pip install -r "$DIR/requirements.txt"

# Pre-cache MobileNetV3 SSDLite detector weights so first run is instantaneous
echo ""
echo "--> Pre-caching person detector weights..."
python -c "
try:
    import torchvision.models.detection as d
    print('Downloading/caching SSDLite MobileNetV3 Large weights...')
    d.ssdlite320_mobilenet_v3_large(weights=d.SSDLite320_MobileNet_V3_Large_Weights.DEFAULT)
    print('[✓] Model weights cached successfully!')
except Exception as e:
    print(f'[i] Optional pre-cache skipped: {e}')
"

# Set executable permissions on run scripts
chmod +x "$DIR/run.sh" "$DIR/run_wsl.sh" "$DIR/install_wsl.sh" 2>/dev/null || true

# Run test suite to verify setup
echo ""
echo "--> Running validation test suite..."
python -m unittest discover "$DIR/tests" -v

echo ""
echo "=========================================================="
echo "  [✓] Installation complete successfully!"
echo "=========================================================="
echo ""
echo "To start the application in WSL:"
echo "  ./run_wsl.sh"
echo ""
echo "Then open your Windows browser (Chrome/Edge) at:"
echo "  http://localhost:8000"
echo "  http://localhost:8000/admin   (Admin Review Studio)"
echo ""
echo "Windows File Access Tip:"
echo "  Your Windows C: drive is mounted at /mnt/c/"
echo "  Example: C:\\Users\\yourname\\photos  ->  /mnt/c/Users/yourname/photos"
echo "=========================================================="
