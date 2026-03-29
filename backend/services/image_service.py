import httpx
import io
from PIL import Image
from fastapi import HTTPException
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_ai_or_not_api_key, get_gemini_api_key
from PIL import Image
from google import genai
from google.genai import types


API_KEY = get_ai_or_not_api_key()
IMAGE_ENDPOINT = "https://api.aiornot.com/v2/image/sync"


async def analyze_from_upload(file):
    async with httpx.AsyncClient() as client:
        contents = await file.read()
        response = await client.post(
            IMAGE_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"image": (file.filename, contents, file.content_type)}
        )
        return response.json()


async def analyze_from_url(url: str):
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            image_response = await client.get(url)
            image_response.raise_for_status()
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=400, detail="Could not fetch image from URL")
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Invalid URL or network error")

        try:
            image = Image.open(io.BytesIO(image_response.content))
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, format="JPEG")
            buffer.seek(0)
        except Exception:
            raise HTTPException(status_code=400, detail="URL does not point to a valid image")

        response = await client.post(
            IMAGE_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"image": ("image.jpg", buffer, "image/jpeg")}
        )
        return response.json()


_gemini_client = None

def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=get_gemini_api_key())
    return _gemini_client

# Add these two new functions
async def analyze_image_with_gemini(image_input) -> str:
    if isinstance(image_input, str):
        async with httpx.AsyncClient() as client:
            resp = await client.get(image_input)
            resp.raise_for_status()
        image = Image.open(io.BytesIO(resp.content))
    else:
        image = image_input

    response = _get_gemini_client().models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            "In 30 words or less explain if this image is AI generated or not and why.",
            image
        ]
    )
    return response.text

async def analyze_youtube_with_gemini(url: str) -> str:
    response = _get_gemini_client().models.generate_content(
        model="gemini-2.5-flash",
        contents=types.Content(
            parts=[
                types.Part(file_data=types.FileData(file_uri=url)),
                types.Part(text="Analyze this video and determine if it was made with or by AI. Look for signs like unnatural movements, inconsistent lighting, strange audio, digital artifacts, or anything else that suggests AI generation. Give a clear verdict and explain your reasoning.")
            ]
        )
    )
    return response.text

if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "apikeys.env"))

    TEST_URL = "https://imgs.search.brave.com/Nzcp5Y68K10t7ezK83y8_sgJzKZjXndFUy5_CLo8zJQ/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWFn/ZXMubmlnaHRjYWZl/LnN0dWRpby8vYXNz/ZXRzL2JlYWNoLWV5/ZS5qcGc_dHI9dy0x/NjAwLGMtYXRfbWF4"

    result = asyncio.run(analyze_from_url(TEST_URL))
    print(result)
