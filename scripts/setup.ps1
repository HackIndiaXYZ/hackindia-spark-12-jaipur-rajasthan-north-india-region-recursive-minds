Write-Host "=========================================="
Write-Host "    Veilex Server Setup & Deploy Script   "
Write-Host "=========================================="

if (-not (Test-Path "server")) {
    Write-Error "Could not find server directory. Run this script from the project root."
    exit 1
}

Write-Host "[*] Navigating to server directory..."
Set-Location -Path "server"

Write-Host "[*] Creating Python virtual environment..."
python -m venv venv

Write-Host "[*] Activating virtual environment..."
& .\venv\Scripts\Activate.ps1

Write-Host "[*] Installing requirements..."
python -m pip install --upgrade pip
pip install -r requirements.txt

Write-Host "[*] Starting Veilex FastAPI Server on port 8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
