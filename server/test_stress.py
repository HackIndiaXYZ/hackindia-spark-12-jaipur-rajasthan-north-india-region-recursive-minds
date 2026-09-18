import time
from unittest.mock import patch
from server.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

dummy_image_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAgACAQAwEAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8A0//Z"

def build_payload(step):
    return {
        "user_prompt": f"Stress test step {step}",
        "screenshot_b64": dummy_image_b64,
        "dom_snapshot": {
            "interactiveElements": [{"id": f"btn-{step}", "tagName": "BUTTON"}]
        },
        "redaction_manifest": {"total_pii_found": 0, "summary": {}},
        "page_url": "https://example.com/stress",
        "page_title": "Stress Test",
        "viewport": {"width": 1280, "height": 720}
    }

def run_stress_test():
    print("[*] Starting Veilex Pipeline Stress Test (10 Iterations)")
    
    async def mock_analyze(*args, **kwargs):
        # Simulate VLM processing time
        time.sleep(0.1)
        return {
            "raw_response": '{"actions": [{"type": "click", "selector": "#btn-test"}], "explanation": "Stress test click.", "is_complete": false}',
            "provider": "mock_stress"
        }

    with patch('server.main.analyze_context', side_effect=mock_analyze):
        start_time = time.time()
        success_count = 0
        
        for i in range(1, 11):
            t0 = time.time()
            resp = client.post("/api/analyze", json=build_payload(i))
            t1 = time.time()
            
            if resp.status_code == 200:
                success_count += 1
                actions = resp.json().get("actions", [])
                print(f"  Step {i}: SUCCESS | Latency: {(t1 - t0)*1000:.2f}ms | Actions: {len(actions)}")
            else:
                print(f"  Step {i}: FAILED  | Status: {resp.status_code} | Error: {resp.text}")
                
        total_time = time.time() - start_time
        print(f"\n[*] Stress test complete. {success_count}/10 successful.")
        print(f"[*] Total time: {total_time:.2f}s | Avg latency: {(total_time/10)*1000:.2f}ms")

if __name__ == "__main__":
    run_stress_test()
