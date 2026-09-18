const https = require('https');
const fs = require('fs');
const path = require('path');

const EXTENSION_DIR = path.join(__dirname, '..', 'extension');
const MODELS_DIR = path.join(EXTENSION_DIR, 'models');
const LIB_DIR = path.join(EXTENSION_DIR, 'lib');

// Ensure directories exist
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });

const FILES_TO_DOWNLOAD = [
  // BlazeFace ONNX Model (lightweight face detector)
  {
    url: 'https://huggingface.co/not-lain/blazeface-onnx/resolve/main/blazeface_back.onnx?download=true',
    dest: path.join(MODELS_DIR, 'blazeface.onnx')
  },
  // ONNX Runtime Web JS
  {
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js',
    dest: path.join(LIB_DIR, 'ort.min.js')
  },
  // ONNX Runtime Web WASM Binary
  {
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort-wasm-simd.wasm',
    dest: path.join(LIB_DIR, 'ort-wasm-simd.wasm')
  },
  // Browser Extension Polyfill
  {
    url: 'https://unpkg.com/webextension-polyfill@0.10.0/dist/browser-polyfill.min.js',
    dest: path.join(LIB_DIR, 'browser-polyfill.js')
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${path.basename(dest)}...`);
    const file = fs.createWriteStream(dest);
    
    // Follow redirects manually if needed, but modern HTTPS usually works
    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Saved: ${path.basename(dest)}`);
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  console.log('--- Veilex Setup Script ---');
  try {
    for (const file of FILES_TO_DOWNLOAD) {
      if (!fs.existsSync(file.dest)) {
        await downloadFile(file.url, file.dest);
      } else {
        console.log(`✓ Already exists: ${path.basename(file.dest)}`);
      }
    }
    console.log('--- Setup Complete ---');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
