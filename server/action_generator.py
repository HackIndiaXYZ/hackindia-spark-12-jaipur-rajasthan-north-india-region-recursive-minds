import json
import re
from typing import List, Optional

# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────
VALID_ACTION_TYPES = {"click", "type", "select", "scroll", "wait", "navigate", "read"}
MAX_ACTIONS_PER_RESPONSE = 10

# Actions that require a CSS selector
SELECTOR_REQUIRED = {"click", "type", "select", "read"}
# Actions that require a value
VALUE_REQUIRED = {"type", "select", "navigate"}

# Patterns that indicate malicious or unsafe content
UNSAFE_URL_PATTERNS = re.compile(
    r"^(javascript|data|vbscript):", re.IGNORECASE
)
UNSAFE_SELECTOR_PATTERNS = re.compile(
    r"(<script|onerror|onload|onclick|onmouseover|eval\(|javascript:)",
    re.IGNORECASE,
)


# ──────────────────────────────────────────────
# JSON Extraction
# ──────────────────────────────────────────────
def _extract_json(raw_text: str) -> Optional[dict]:
    """
    Attempts to extract a JSON object from VLM output using multiple strategies.
    VLMs often wrap JSON in markdown fences, add preamble text, or produce
    slightly malformed output — this handles all common cases.
    """
    if not raw_text or not raw_text.strip():
        return None

    raw_text = raw_text.strip()

    # Strategy 1: Direct JSON parse (ideal case — prompt asks for raw JSON)
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from ```json ... ``` markdown blocks
    json_block = re.search(r"```(?:json)?\s*\n?(.*?)```", raw_text, re.DOTALL)
    if json_block:
        try:
            data = json.loads(json_block.group(1).strip())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    # Strategy 3: Find the first { ... } block (greedy match for outermost braces)
    brace_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if brace_match:
        try:
            data = json.loads(brace_match.group(0))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    # Strategy 4: Find [ ... ] array (VLM might return just the actions array)
    bracket_match = re.search(r"\[.*\]", raw_text, re.DOTALL)
    if bracket_match:
        try:
            data = json.loads(bracket_match.group(0))
            if isinstance(data, list):
                return {"actions": data}
        except json.JSONDecodeError:
            pass

    print(f"[Action Generator] Could not extract JSON from VLM output ({len(raw_text)} chars)")
    return None


# ──────────────────────────────────────────────
# Action Validation
# ──────────────────────────────────────────────
def _validate_action(action: dict) -> Optional[dict]:
    """
    Validates and sanitizes a single action.
    Returns a cleaned action dict, or None if invalid.
    """
    if not isinstance(action, dict):
        return None

    action_type = action.get("type", "").lower().strip()
    if action_type not in VALID_ACTION_TYPES:
        print(f"[Action Generator] Rejected unknown action type: {action_type}")
        return None

    selector = action.get("selector")
    value = action.get("value")

    # Validate selector requirement
    if action_type in SELECTOR_REQUIRED:
        if not selector or not isinstance(selector, str) or not selector.strip():
            print(f"[Action Generator] Rejected '{action_type}' — missing selector")
            return None
        selector = selector.strip()

        # Block unsafe selectors
        if UNSAFE_SELECTOR_PATTERNS.search(selector):
            print(f"[Action Generator] Rejected '{action_type}' — unsafe selector: {selector}")
            return None

    # Validate value requirement
    if action_type in VALUE_REQUIRED:
        if value is None or (isinstance(value, str) and not value.strip()):
            print(f"[Action Generator] Rejected '{action_type}' — missing value")
            return None

    # Block unsafe navigation URLs
    if action_type == "navigate" and isinstance(value, str):
        if UNSAFE_URL_PATTERNS.match(value.strip()):
            print(f"[Action Generator] Rejected navigate — unsafe URL: {value}")
            return None

    # Build clean action (strip unknown fields)
    clean = {"type": action_type}
    if selector:
        clean["selector"] = selector.strip()
    if value is not None:
        clean["value"] = str(value).strip() if isinstance(value, str) else value

    # Pass through optional direction for scroll
    if action_type == "scroll" and "direction" in action:
        direction = action["direction"]
        if direction in ("up", "down"):
            clean["direction"] = direction

    return clean


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────
def generate_actions(vlm_response: dict) -> List[dict]:
    """
    Takes the VLM response dictionary, extracts, validates, and returns
    a list of safe, structured action objects.
    """
    raw_text = vlm_response.get("raw_response", "")
    parsed = _extract_json(raw_text)

    if parsed is None:
        print("[Action Generator] No valid JSON found in VLM output. Returning empty actions.")
        return []

    # Extract the actions list — handle both {"actions": [...]} and direct [...]
    raw_actions = parsed.get("actions", [])
    if not isinstance(raw_actions, list):
        print(f"[Action Generator] 'actions' is not a list: {type(raw_actions)}")
        return []

    # Validate and sanitize each action
    validated = []
    for action in raw_actions:
        clean = _validate_action(action)
        if clean is not None:
            validated.append(clean)

    # Enforce max actions limit
    if len(validated) > MAX_ACTIONS_PER_RESPONSE:
        print(f"[Action Generator] Truncating {len(validated)} actions to {MAX_ACTIONS_PER_RESPONSE}")
        validated = validated[:MAX_ACTIONS_PER_RESPONSE]

    print(f"[Action Generator] Produced {len(validated)} validated actions from {len(raw_actions)} raw.")
    return validated


def extract_explanation(vlm_response: dict) -> str:
    """Extracts the explanation field from the VLM response, if present."""
    raw_text = vlm_response.get("raw_response", "")
    parsed = _extract_json(raw_text)
    if parsed and "explanation" in parsed:
        return str(parsed["explanation"])
    return "Actions generated from VLM analysis."


def is_goal_complete(vlm_response: dict) -> bool:
    """Checks if the VLM indicated the goal is complete."""
    raw_text = vlm_response.get("raw_response", "")
    parsed = _extract_json(raw_text)
    if parsed and "is_complete" in parsed:
        return bool(parsed["is_complete"])
    return False
