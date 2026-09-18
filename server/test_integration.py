import json
import base64
import time
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

# Dummy 32x32 white JPEG
dummy_image_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAgACAQAwEAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8A0//Z"

def build_payload(prompt, dom_elements):
    return {
        "user_prompt": prompt,
        "screenshot_b64": dummy_image_b64,
        "dom_snapshot": {
            "interactiveElements": dom_elements
        },
        "redaction_manifest": {
            "total_pii_found": 1,
            "summary": {"EMAIL": 1}
        },
        "page_url": "https://example.com/checkout",
        "page_title": "Checkout Page",
        "viewport": {"width": 1280, "height": 720}
    }

def run_integration_test():
    print("[*] Starting Veilex Multi-Step Integration Test\n")
    
    # We will mock the vlm_engine.analyze_context to bypass Groq API for testing the server logic
    import server.main
    from unittest.mock import patch
    
    async def mock_analyze(*args, **kwargs):
        prompt = kwargs.get('prompt', '')
        dom = kwargs.get('dom_snapshot', {})
        elements = dom.get('interactiveElements', [])
        
        # Check if "email_field" is in the dom snapshot
        has_email_field = 'email_field' in str(elements)
        
        print(f"[MOCK DEBUG] has_email_field: {has_email_field}, elements: {elements}")
        
        if "Checkout" in prompt and has_email_field:
            # Step 1 response
            return {
                "raw_response": '{"actions": [{"type": "type", "selector": "#email_field", "value": "test@example.com"}, {"type": "click", "selector": "#continue_btn"}], "explanation": "Entering email and clicking continue."}',
                "provider": "mock"
            }
        else:
            # Step 2 response (goal complete)
            return {
                "raw_response": '{"actions": [], "explanation": "The success message is visible, goal is complete."}',
                "provider": "mock"
            }

    with patch('server.main.analyze_context', side_effect=mock_analyze):
        # ── Step 1: Fill out email ──
        print("[*] Step 1: User wants to checkout. Asking VLM to enter email.")
        payload_1 = build_payload(
            prompt="Checkout with my email test@example.com",
            dom_elements=[
                {"tag": "input", "type": "email", "id": "email_field", "placeholder": "Enter email"},
                {"tag": "button", "id": "continue_btn", "text": "Continue"}
            ]
        )
        
        resp_1 = client.post("/api/analyze", json=payload_1)
        data_1 = resp_1.json()
        print(f"Status: {resp_1.status_code}")
        print(f"Explanation: {data_1.get('explanation')}")
        print(f"Actions: {json.dumps(data_1.get('actions'), indent=2)}\n")
        
        if not data_1.get("actions"):
            print("[X] Failed: Expected actions in Step 1.")
            return

        # Simulate extension executing the action and moving to Step 2
        time.sleep(1)

        # ── Step 2: Goal Complete ──
        print("[*] Step 2: Form was submitted. Simulating confirmation page.")
        payload_2 = build_payload(
            prompt="Checkout with my email test@example.com",
            dom_elements=[
                {"tag": "div", "id": "success_msg", "text": "Thanks for checking out!"}
            ]
        )
        
        resp_2 = client.post("/api/analyze", json=payload_2)
        data_2 = resp_2.json()
        print(f"Status: {resp_2.status_code}")
        print(f"Explanation: {data_2.get('explanation')}")
        print(f"Actions: {json.dumps(data_2.get('actions'), indent=2)}\n")
        
        if len(data_2.get("actions", [])) > 0:
            print("[X] Failed: Expected 0 actions because goal is complete.")
        else:
            print("[OK] Integration test passed! Multi-step logic works.")

if __name__ == "__main__":
    try:
        health = client.get("/api/health")
        if health.status_code == 200:
            run_integration_test()
        else:
            print(f"Server health check failed: {health.status_code}")
    except Exception as e:
        print(f"Test failed with exception: {e}")
