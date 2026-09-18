from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables before anything else
load_dotenv()

from models import AnalyzeRequest, AnalyzeResponse
from vlm_engine import analyze_context
from action_generator import generate_actions

app = FastAPI(title="Veilex Backend Server")

# Allow CORS for the extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to chrome-extension:// IDs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint for the extension to poll."""
    return {"status": "online"}

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalyzeRequest):
    """
    Main pipeline endpoint:
    Receives sanitized context, runs VLM analysis, and returns actions.
    """
    try:
        # 1. Send context to VLM
        vlm_response = await analyze_context(
            prompt=request.user_prompt,
            screenshot_b64=request.screenshot_b64,
            dom_snapshot=request.dom_snapshot
        )
        
        # 2. Parse and generate structured actions
        actions = generate_actions(vlm_response)
        
        return AnalyzeResponse(
            actions=actions,
            explanation="I extracted these actions based on the provided prompt and UI state."
        )
        
    except Exception as e:
        print(f"[API Error] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
