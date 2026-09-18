import json
import os
import httpx
from groq import AsyncGroq

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5-vl:7b")

# ──────────────────────────────────────────────
# System Prompt — Redaction-aware, multi-step, few-shot
# ──────────────────────────────────────────────
SYSTEM_PROMPT = """You are Veilex, an autonomous browser interaction agent.
Your objective is to accomplish the user's goal by analyzing the current screen state and proposing a sequence of actions.

## Context You Receive
1. A **redacted screenshot** (JPEG) — sensitive regions are visually masked (faces blurred, text PII blacked out with labels like [EMAIL], [PASSWORD]).
2. A **sanitized DOM snapshot** — interactive elements with types, labels, bounding boxes. PII text has been replaced with tokens like [EMAIL_REDACTED], [PASSWORD_REDACTED].
3. A **redaction manifest** — metadata about what was redacted, where, by which detector, and at what confidence. Use this to understand the page layout even where content is hidden.
4. The **user's natural language prompt** describing their goal.

## Redaction Awareness Rules
- Fields marked [PASSWORD_REDACTED], [EMAIL_REDACTED], etc. contain real user data that was stripped for privacy.
- NEVER guess, reconstruct, or hallucinate the original values of redacted fields.
- You CAN interact with redacted fields (click them, indicate the user should type in them) — just don't assume their content.
- When a field shows [TYPE_REDACTED], refer to it by its label, placeholder, or position — not by the redacted value.

## Multi-Step Flow
- You may be called repeatedly in a loop. Each call represents one step.
- After you return actions, the extension executes them, re-captures the screen, and calls you again with the updated state.
- If the user's goal is fully complete (e.g., form submitted, page navigated), return an EMPTY actions array.
- Keep each step focused — return 1–5 actions per step. Don't try to do everything at once.

## Response Format
You MUST respond with ONLY a JSON object (no markdown fences, no explanation outside the JSON). The JSON must have this exact structure:

{"actions": [<action objects>], "explanation": "<short reason for these actions>", "is_complete": <true if goal is done>}

## Valid Action Types
- "click" — requires "selector" (CSS selector of the element to click)
- "type" — requires "selector" and "value" (text to type into the field)
- "select" — requires "selector" and "value" (option value to select)
- "scroll" — optional "direction" ("up" or "down", default "down")
- "wait" — no extra args, waits for network/rendering to settle
- "navigate" — requires "value" (URL to navigate to)
- "read" — requires "selector", reads text content of element

## Action Rules
1. ONLY target selectors that exist in the provided DOM snapshot.
2. Use robust CSS selectors: prefer #id, [name="..."], [placeholder="..."], or tag[type="..."].
3. Type into fields BEFORE clicking submit buttons.
4. If a field already has content, click it first, then type (the executor will clear it).
5. Maximum 5 actions per response. Focus on the immediate next step.
6. If the goal appears complete or you cannot proceed, set "is_complete": true and return empty actions.

## Few-Shot Examples

### Example 1: Fill a search box and submit
User prompt: "Search for 'weather forecast'"
DOM: [{"tag": "input", "id": "search-box", "type": "text", "placeholder": "Search..."}, {"tag": "button", "id": "search-btn", "type": "submit"}]

Response:
{"actions": [{"type": "type", "selector": "#search-box", "value": "weather forecast"}, {"type": "click", "selector": "#search-btn"}], "explanation": "Typing the search query and clicking submit.", "is_complete": false}

### Example 2: Goal already complete
User prompt: "Submit the form"
DOM shows a "Thank you" confirmation page.

Response:
{"actions": [], "explanation": "The form has already been submitted. Confirmation page is displayed.", "is_complete": true}
"""


async def analyze_context(
    prompt: str,
    screenshot_b64: str,
    dom_snapshot: dict,
    redaction_manifest: dict = None,
    page_url: str = "",
    page_title: str = "",
) -> dict:
    """
    Sends sanitized context to a VLM (Groq primary, Ollama fallback).
    Returns the raw VLM response dictionary.
    """
    # Strip data URI prefix if present
    if screenshot_b64 and screenshot_b64.startswith("data:image"):
        screenshot_b64 = screenshot_b64.split(",", 1)[1]

    # Build the user message with all available context
    user_text = _build_user_message(prompt, dom_snapshot, redaction_manifest, page_url, page_title)

    # Try Groq first, fall back to Ollama
    if GROQ_API_KEY:
        try:
            return await _call_groq(user_text, screenshot_b64)
        except Exception as e:
            print(f"[VLM Engine] Groq failed: {e}. Trying Ollama fallback...")

    # Ollama fallback
    return await _call_ollama(user_text, screenshot_b64)


def _build_user_message(
    prompt: str,
    dom_snapshot: dict,
    redaction_manifest: dict = None,
    page_url: str = "",
    page_title: str = "",
) -> str:
    """Constructs a compact text message with all context for the VLM."""
    parts = []

    parts.append(f"## User Goal\n{prompt}")

    if page_url or page_title:
        parts.append(f"## Page\nURL: {page_url}\nTitle: {page_title}")

    # Include interactive elements (cap at 80 to stay within token limits)
    elements = dom_snapshot.get("interactiveElements", []) if dom_snapshot else []
    if elements:
        compact_elements = []
        for el in elements[:80]:
            entry = {k: v for k, v in el.items() if k in (
                "tag", "type", "id", "name", "placeholder", "value",
                "label", "autocomplete", "bbox", "text"
            ) and v}
            compact_elements.append(entry)
        parts.append(f"## Interactive Elements ({len(compact_elements)} shown)\n{json.dumps(compact_elements, separators=(',', ':'))}")

    # Include redaction manifest summary
    if redaction_manifest:
        summary = redaction_manifest.get("summary", {})
        total = redaction_manifest.get("total_pii_found", 0)
        if total > 0:
            parts.append(f"## Redaction Summary\n{total} PII items redacted: {json.dumps(summary)}")

    parts.append("## Task\nAnalyze the screenshot and DOM above. Return the next actions as JSON.")

    return "\n\n".join(parts)


async def _call_groq(user_text: str, screenshot_b64: str) -> dict:
    """Calls the Groq API with vision model."""
    client = AsyncGroq(api_key=GROQ_API_KEY)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{screenshot_b64}"
                    },
                },
            ],
        },
    ]

    response = await client.chat.completions.create(
        model="qwen/qwen3.8-27b",
        messages=messages,
        temperature=0.1,
        max_tokens=1024,
    )

    raw_output = response.choices[0].message.content
    print(f"[VLM Engine] Groq returned {len(raw_output)} chars.")

    return {
        "raw_response": raw_output,
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
    }


async def _call_ollama(user_text: str, screenshot_b64: str) -> dict:
    """
    Calls a local Ollama instance via its OpenAI-compatible API.
    Requires Ollama to be running with a vision model pulled.
    """
    url = f"{OLLAMA_BASE_URL}/v1/chat/completions"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{screenshot_b64}"
                    },
                },
            ],
        },
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 1024,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        raw_output = data["choices"][0]["message"]["content"]
        print(f"[VLM Engine] Ollama ({OLLAMA_MODEL}) returned {len(raw_output)} chars.")

        return {
            "raw_response": raw_output,
            "provider": "ollama",
            "model": OLLAMA_MODEL,
        }

    except httpx.ConnectError:
        raise ConnectionError(
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Ensure Ollama is running (`ollama serve`) and a vision model is pulled "
            f"(`ollama pull {OLLAMA_MODEL}`)."
        )
    except Exception as e:
        raise RuntimeError(f"Ollama request failed: {e}")
