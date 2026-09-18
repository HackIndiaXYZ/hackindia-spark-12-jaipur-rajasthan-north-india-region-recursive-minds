from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class Viewport(BaseModel):
    width: int
    height: int

class AnalyzeRequest(BaseModel):
    screenshot_b64: str = Field(..., description="Base64 encoded redacted screenshot (JPEG)")
    dom_snapshot: Dict[str, Any] = Field(..., description="Sanitized DOM extraction containing interactive elements")
    redaction_manifest: Optional[Dict[str, Any]] = Field(None, description="Metadata about the redactions performed")
    user_prompt: str = Field(..., description="The user's natural language goal")
    page_url: str = Field(..., description="Origin URL of the page")
    page_title: str = Field(..., description="Title of the page")
    viewport: Viewport
    timestamp: str

class Action(BaseModel):
    type: str = Field(..., description="Action type: 'click', 'type', 'navigate', 'scroll', 'select', 'wait', 'read'")
    selector: Optional[str] = Field(None, description="CSS selector for the target element (if applicable)")
    value: Optional[str] = Field(None, description="Value to type or select (if applicable)")

class AnalyzeResponse(BaseModel):
    actions: List[Action]
    explanation: str = Field(..., description="Short explanation of why these actions were chosen")
