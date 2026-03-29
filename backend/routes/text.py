from fastapi import APIRouter
from pydantic import BaseModel
from services.text_service import analyze_text

router = APIRouter(prefix="/text", tags=["text"])

class TextBody(BaseModel):
    text: str
    url: str | None = None  # Optional — for reference only, not used in analysis

@router.post("/analyze")
async def analyze_page_text(body: TextBody):
    result = await analyze_text(body.text)
    return result
