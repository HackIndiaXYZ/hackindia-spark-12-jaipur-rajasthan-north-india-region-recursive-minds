import json
import base64
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

# Dummy 32x32 white JPEG
dummy_image_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAgACAQAwEAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8A0//Z"

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
    },
    "page_url": "https://example.com/login",
    "page_title": "Login Page",
    "viewport": {"width": 1280, "height": 720}
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
