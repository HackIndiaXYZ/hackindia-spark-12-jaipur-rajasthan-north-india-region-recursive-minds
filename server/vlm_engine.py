import json
import os
import asyncio
from groq import AsyncGroq

# Setup the Groq client
# Fallback to empty string if not in environment to prevent immediate crashes on startup
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = AsyncGroq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = """You are Veilex, an autonomous browser interaction agent.
Your objective is to accomplish the user's goal by analyzing the current screen state and proposing a sequence of actions.

You will be provided with:
1. A base64 encoded screenshot of the current page (with sensitive information visually redacted).
2. A sanitized DOM snapshot containing interactive elements and text blocks.
3. The user's prompt.

You MUST respond with a JSON block containing the actions to take. 
Always wrap the JSON in a markdown code block like this:
```json
{
  "actions": [
    {"type": "type", "selector": "input[name='q']", "value": "search term"},
    {"type": "click", "selector": "button[type='submit']"}
  ]
}
```

VALID ACTION TYPES:
- 'click' (Requires: selector)
- 'type' (Requires: selector, value)
- 'select' (Requires: selector, value)
- 'scroll' (No extra args, scrolls down)
- 'wait' (No extra args, waits for network/rendering)
- 'navigate' (Requires: value as URL)

RULES:
1. ONLY target selectors that actually exist in the provided DOM snapshot.
2. Formulate robust CSS selectors based on id, name, placeholder, or tag.
3. NEVER assume the exact value of redacted fields; interact with them using standard inputs.
4. Keep the sequence logical. E.g., type into fields before clicking submit.
5. If the goal is complete, return an empty actions array.
"""

async def analyze_context(prompt: str, screenshot_b64: str, dom_snapshot: dict) -> dict:
    """
    Sends the context to the Groq Llama 3.2 90B Vision model.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in environment.")

    # Remove the data:image prefix if present, as Groq API expects pure base64
    if screenshot_b64.startswith("data:image"):
        screenshot_b64 = screenshot_b64.split(",")[1]

    # Package the DOM summary to be compact
    dom_summary = json.dumps(dom_snapshot.get("interactiveElements", [])[:100]) # Cap at 100 for token limits

    try:
        response = await client.chat.completions.create(
            model="llama-3.2-90b-vision-preview",
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"User Goal: {prompt}\n\nAvailable Interactive Elements:\n{dom_summary}\n\nWhat are the next actions?"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{screenshot_b64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.2,
            max_tokens=1024
        )

        raw_output = response.choices[0].message.content
        print(f"[VLM Engine] Groq returned {len(raw_output)} characters.")
        
        return {
            "raw_response": raw_output,
            "provider": "groq",
            "model": "llama-3.2-90b-vision-preview"
        }
        
    except Exception as e:
        print(f"[VLM Engine] Groq API Error: {e}")
        # In a production scenario, we could fallback to Ollama here
        raise
