import os
import urllib.request
from pathlib import Path

# Setup paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_DIR = PROJECT_ROOT / "extension"
MODELS_DIR = EXTENSION_DIR / "models"
LIB_DIR = EXTENSION_DIR / "lib"

# Ensure directories exist
MODELS_DIR.mkdir(parents=True, exist_ok=True)
LIB_DIR.mkdir(parents=True, exist_ok=True)

FILES_TO_DOWNLOAD = [
    # BlazeFace ONNX Model (lightweight face detector)
    {
        "url": "https://github.com/ibaiGorordo/ONNX-BlazeFace-Face-Detection/raw/main/models/blazeface_back.onnx",
        "dest": MODELS_DIR / "blazeface.onnx"
    },
    # ONNX Runtime Web JS
    {
        "url": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js",
        "dest": LIB_DIR / "ort.min.js"
    },
    # ONNX Runtime Web WASM Binary
    {
        "url": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort-wasm-simd.wasm",
        "dest": LIB_DIR / "ort-wasm-simd.wasm"
    },
    # Browser Extension Polyfill
    {
        "url": "https://unpkg.com/webextension-polyfill@0.10.0/dist/browser-polyfill.min.js",
        "dest": LIB_DIR / "browser-polyfill.js"
    }
]

def download_file(url, dest_path):
    print(f"Downloading: {dest_path.name}...")
    try:
        # User-Agent is sometimes required to avoid 403s on CDNs
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"[OK] Saved: {dest_path.name}")
    except Exception as e:
        print(f"Failed to download {dest_path.name}: {e}")
        if dest_path.exists():
            dest_path.unlink()
        # Continuing despite error

def main():
    print("--- Veilex Setup Script ---")
    for file_info in FILES_TO_DOWNLOAD:
        dest = file_info["dest"]
        url = file_info["url"]
        
        if not dest.exists():
            download_file(url, dest)
        else:
            print(f"[OK] Already exists: {dest.name}")
            
    print("--- Setup Complete ---")

if __name__ == "__main__":
    main()
