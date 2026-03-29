import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_gemini_api_key
from fastapi import HTTPException
from google import genai

gemini_client = genai.Client(api_key=get_gemini_api_key())

ANALYSIS_PROMPT = """
You are a fact-checking assistant. Analyze the following webpage text and return a JSON object with exactly these fields:

{
  "verdict": "likely_real" | "uncertain" | "likely_ai",
  "ai_score": <integer 0-100, where 100 = definitely AI-generated>,
  "ai_signals": [<list of specific patterns observed that suggest AI writing, or empty list>],
  "claims": [
    {
      "text": <the specific claim>,
      "assessment": "supported" | "contradicted" | "unverifiable",
      "explanation": <one sentence explanation>
    }
  ],
  "summary": <2-3 sentence plain English summary of your findings>
}

Important rules:
- ai_signals should be specific patterns like "excessive hedging", "generic list structure",
  "no named sources", "suspiciously balanced phrasing" — not vague statements
- Never claim content IS definitively AI-generated, only flag likelihood
- Only include claims that are verifiable factual assertions, not opinions
- Keep claim list to the 3 most important checkable claims maximum
- Return valid JSON only, no markdown, no explanation outside the JSON

Webpage text to analyze:
"""

async def analyze_text(text: str) -> dict:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    if len(text) > 20000:
        text = text[:20000]

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=ANALYSIS_PROMPT + text
        )

        import json
        raw = response.text.strip()

        # Strip markdown code fences if Gemini adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        return json.loads(raw)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Gemini returned malformed JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
