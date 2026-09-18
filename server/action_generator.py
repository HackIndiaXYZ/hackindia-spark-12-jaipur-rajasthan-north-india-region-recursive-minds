import json
import re

# Veilex — Action Generator Scaffold (Dev 4 - Phase 1)

def parse_vlm_output(raw_text: str) -> dict:
    """
    Parses the raw text output from the VLM to extract the structured JSON actions.
    Handles common LLM hallucinations like markdown blocks.
    """
    # Simple regex to extract JSON from markdown fences if present
    json_match = re.search(r'```json\n(.*?)```', raw_text, re.DOTALL)
    
    json_str = raw_text
    if json_match:
        json_str = json_match.group(1)
        
    try:
        data = json.loads(json_str)
        return data.get("actions", [])
    except json.JSONDecodeError as e:
        print(f"[Action Generator] Failed to parse JSON: {e}")
        return []

def generate_actions(vlm_response: dict) -> list:
    """
    Takes the VLM response dictionary, extracts and validates the actions.
    """
    raw_text = vlm_response.get("raw_response", "")
    actions = parse_vlm_output(raw_text)
    
    # In a real scenario, we might do further validation here (e.g. ensuring selectors are valid)
    return actions
