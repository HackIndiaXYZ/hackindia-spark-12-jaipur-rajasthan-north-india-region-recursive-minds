<div align="center">
  <img src="extension/icons/icon128.png" alt="Veilex Logo" width="128">
  <h1>Veilex</h1>
  <p><strong>Privacy-Preserving Agentic Web Automation</strong></p>
</div>

---

## 🛡️ What is Veilex?

Veilex is an intelligent, privacy-first browser extension that automates complex web tasks (form filling, navigation, data extraction) on your behalf. Powered by Vision-Language Models (VLMs), Veilex understands web pages just like a human does. 

However, sending raw screenshots to a cloud AI model exposes your personal information. Veilex solves this by implementing a **local, client-side privacy layer** that detects and visually redacts PII (Personally Identifiable Information) *before* the context ever leaves your machine. 

### Key Features
- **Intelligent Automation**: Give Veilex a natural language prompt (e.g., "Checkout with my saved card"), and it will orchestrate the clicks, types, and navigation.
- **Client-Side Redaction**: Uses localized ML models (BlazeFace for faces, MobileNet for objects, regex for emails/phones/DOB) to detect and pixelate PII locally within milliseconds.
- **Agentic Multi-Step Pipelines**: Analyzes the page, generates structured actions, executes them in the DOM, and repeats until the user's goal is met.

---

## ⚙️ Extension Installation & Usage

### 1. Install the Extension (Chrome)
1. Clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left.
5. Select the `extension/` folder from this repository.
6. The Veilex extension icon will appear in your Chrome toolbar!

### 2. Configure the Backend Server
The extension requires the Veilex Python API backend to process prompts and generate actions.
1. Navigate to the `server/` directory.
2. Create a virtual environment and install the requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Set your Groq API key in the environment or a `.env` file (`GROQ_API_KEY=your_key`).
4. Start the server:
   ```bash
   uvicorn server.main:app --host 0.0.0.0 --port 8000
   ```
*(Note: Ensure the server URL in the extension popup settings matches `http://localhost:8000`)*

### 3. Using Veilex
1. Navigate to any web page (e.g., a registration form).
2. Click the Veilex extension icon in the toolbar.
3. Type your goal into the input box (e.g., "Fill out the registration form").
4. Click **Execute**.
5. Watch the dashboard as Veilex captures the page, redacts your PII locally, sends the sanitized context to the backend, and executes the returned actions in the DOM!

---

*Built by Recursive Minds for HackIndia Spark 12 (Jaipur).*
