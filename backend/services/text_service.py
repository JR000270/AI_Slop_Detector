import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_ai_or_not_api_key
from fastapi import HTTPException
import httpx

TEXT_ENDPOINT = "https://api.aiornot.com/v2/text/sync"


def _map_verdict(confidence: float) -> str:
    if confidence >= 0.7:
        return "likely_ai"
    elif confidence >= 0.4:
        return "uncertain"
    else:
        return "likely_real"


async def analyze_text(text: str) -> dict:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    if len(text) > 500000:
        text = text[:500000]

    api_key = get_ai_or_not_api_key()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                TEXT_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                data={"text": text},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"AI-or-Not error: {e.response.text}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI-or-Not unreachable: {str(e)}")

    ai_text = data.get("report", {}).get("ai_text", {})
    confidence = ai_text.get("confidence", 0.0)
    is_detected = ai_text.get("is_detected", False)

    return {
        "verdict": _map_verdict(confidence),
        "ai_score": round(confidence * 100),
        "is_detected": is_detected,
        "confidence": confidence,
    }
