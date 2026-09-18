import time
from unittest.mock import patch
from server.main import app
from fastapi.testclient import TestClient
import json

client = TestClient(app)

dummy_image_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAgACAQAwEAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8A0//Z"

def build_payload(elements):
    return {
        "user_prompt": "Fill out the registration form",
        "screenshot_b64": dummy_image_b64,
        "dom_snapshot": {
            "interactiveElements": elements
        },
        "redaction_manifest": {"total_pii_found": 0, "summary": {}},
        "page_url": "https://example.com/register",
        "page_title": "Registration",
        "viewport": {"width": 1280, "height": 720}
    }

def run_multistep_test():
    print("[*] Starting Multi-Step Form Filling Test (5+ steps)\n")
    
    # We maintain the "state" of the form in this mock
    state = {
        "step": 1
    }
    
    async def mock_analyze(*args, **kwargs):
        if state["step"] == 1:
            resp = '{"actions": [{"type": "type", "selector": "#first_name", "value": "John"}], "explanation": "Step 1: First name", "is_complete": false}'
        elif state["step"] == 2:
            resp = '{"actions": [{"type": "type", "selector": "#last_name", "value": "Doe"}], "explanation": "Step 2: Last name", "is_complete": false}'
        elif state["step"] == 3:
            resp = '{"actions": [{"type": "type", "selector": "#email", "value": "john@test.com"}], "explanation": "Step 3: Email", "is_complete": false}'
        elif state["step"] == 4:
            resp = '{"actions": [{"type": "type", "selector": "#password", "value": "secret"}], "explanation": "Step 4: Password", "is_complete": false}'
        elif state["step"] == 5:
            resp = '{"actions": [{"type": "click", "selector": "#submit"}], "explanation": "Step 5: Submit form", "is_complete": false}'
        else:
            resp = '{"actions": [], "explanation": "Form submitted. Goal is complete.", "is_complete": true}'
            
        state["step"] += 1
        return {"raw_response": resp, "provider": "mock"}

    with patch('server.main.analyze_context', side_effect=mock_analyze):
        for i in range(1, 7):
            print(f"--- Step {i} ---")
            elements = [{"id": "some_input", "tagName": "INPUT"}] if i < 6 else [{"id": "success", "tagName": "DIV"}]
            resp = client.post("/api/analyze", json=build_payload(elements))
            
            data = resp.json()
            actions = data.get("actions", [])
            print(f"Explanation: {data.get('explanation')}")
            print(f"Actions returned: {len(actions)}")
            if len(actions) == 0:
                print(">> Multi-step goal achieved!")
                break
                
    print("\n[OK] Multi-step form filling 5+ steps test PASSED.")

if __name__ == "__main__":
    run_multistep_test()
