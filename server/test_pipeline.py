import json
import base64
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# Create a simple 1x1 transparent GIF encoded in base64 to simulate a screenshot
dummy_image_b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

request_payload = {
    "user_prompt": "Click the login button",
    "screenshot_b64": dummy_image_b64,
    "dom_snapshot": {
        "interactiveElements": [
            {
                "id": "login-btn",
                "tagName": "BUTTON",
                "text": "Login"
            }
        ]
    }
}

print("Testing /api/health...")
health_response = client.get("/api/health")
print("Health Status Code:", health_response.status_code)
print("Health Response JSON:", health_response.json())
print("-" * 40)

print("Testing /api/analyze...")
try:
    analyze_response = client.post("/api/analyze", json=request_payload)
    print("Analyze Status Code:", analyze_response.status_code)
    print("Analyze Response JSON:", json.dumps(analyze_response.json(), indent=2))
except Exception as e:
    print("Exception during analyze test:", e)
