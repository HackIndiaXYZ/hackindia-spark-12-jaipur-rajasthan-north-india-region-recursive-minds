import os
from dotenv import load_dotenv

# Load env before any local imports
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

import logging
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import AnalyzeRequest, AnalyzeResponse, Action
from .vlm_engine import analyze_context
from .action_generator import generate_actions, extract_explanation, is_goal_complete

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("veilex")

# ──────────────────────────────────────────────
# App
# ──────────────────────────────────────────────
app = FastAPI(title="Veilex Backend Server", version="0.3.0")

# Allow CORS for the extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to chrome-extension:// IDs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Analytics & Metrics Tracker
# ──────────────────────────────────────────────
analytics = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "total_vlm_time": 0.0,
    "errors": {}
}

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint for the extension to poll."""
    return {
        "status": "online", 
        "version": "0.3.0",
        "analytics": analytics
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalyzeRequest):
    """
    Main pipeline endpoint:
    Receives sanitized context, runs VLM analysis, and returns actions.
    """
    analytics["total_requests"] += 1
    t0 = time.time()

    # Log request metadata
    dom_element_count = len(request.dom_snapshot.get("interactiveElements", [])) if request.dom_snapshot else 0
    redaction_count = request.redaction_manifest.get("total_pii_found", 0) if request.redaction_manifest else 0
    screenshot_size_kb = len(request.screenshot_b64) * 3 // 4 // 1024  # approx decoded size

    logger.info(
        "📥 Analyze request | page=%s | dom_elements=%d | redactions=%d | screenshot=~%dKB | prompt='%s'",
        request.page_url,
        dom_element_count,
        redaction_count,
        screenshot_size_kb,
        request.user_prompt[:80],
    )

    try:
        # 1. Send context to VLM (Groq primary, Ollama fallback)
        vlm_response = await analyze_context(
            prompt=request.user_prompt,
            screenshot_b64=request.screenshot_b64,
            dom_snapshot=request.dom_snapshot,
            redaction_manifest=request.redaction_manifest,
            page_url=request.page_url,
            page_title=request.page_title,
        )

        vlm_time = time.time() - t0

        # 2. Parse and validate actions
        actions = generate_actions(vlm_response)
        explanation = extract_explanation(vlm_response)
        goal_complete = is_goal_complete(vlm_response)

        if goal_complete and not actions:
            explanation = explanation or "Goal appears to be complete."

        total_time = time.time() - t0
        analytics["successful_requests"] += 1
        analytics["total_vlm_time"] += vlm_time

        logger.info(
            "📤 Response | provider=%s | actions=%d | complete=%s | vlm=%.1fs | total=%.1fs",
            vlm_response.get("provider", "?"),
            len(actions),
            goal_complete,
            vlm_time,
            total_time,
        )

        return AnalyzeResponse(
            actions=[Action(**a) for a in actions],
            explanation=explanation,
        )

    except ConnectionError as e:
        analytics["failed_requests"] += 1
        error_type = "ConnectionError"
        analytics["errors"][error_type] = analytics["errors"].get(error_type, 0) + 1
        logger.error("🔴 VLM connection error: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        analytics["failed_requests"] += 1
        error_type = type(e).__name__
        analytics["errors"][error_type] = analytics["errors"].get(error_type, 0) + 1
        logger.error("🔴 Pipeline error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/test")
async def test_endpoint():
    """
    Test endpoint that returns a mock action response.
    Useful for verifying the extension can talk to the server.
    """
    return {
        "actions": [
            {"type": "click", "selector": "#test-button"},
            {"type": "type", "selector": "#search-input", "value": "hello world"},
        ],
        "explanation": "Mock response from test endpoint.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)
