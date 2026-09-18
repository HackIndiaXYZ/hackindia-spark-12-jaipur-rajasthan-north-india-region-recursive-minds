#!/bin/bash

echo "=========================================="
echo "    Veilex Server Setup & Deploy Script   "
echo "=========================================="

echo "[*] Navigating to server directory..."
cd server || { echo "Error: Could not find server directory. Run this script from the project root."; exit 1; }

echo "[*] Creating Python virtual environment..."
python3 -m venv venv

echo "[*] Activating virtual environment..."
source venv/bin/activate

echo "[*] Installing requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo "[*] Starting Veilex FastAPI Server on port 8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
