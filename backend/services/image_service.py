import httpx
import io
from PIL import Image
from fastapi import HTTPException
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_ai_or_not_api_key

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
    async with httpx.AsyncClient() as client:
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


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "apikeys.env"))

    TEST_URL = "https://imgs.search.brave.com/Nzcp5Y68K10t7ezK83y8_sgJzKZjXndFUy5_CLo8zJQ/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWFn/ZXMubmlnaHRjYWZl/LnN0dWRpby8vYXNz/ZXRzL2JlYWNoLWV5/ZS5qcGc_dHI9dy0x/NjAwLGMtYXRfbWF4"

    result = asyncio.run(analyze_from_url(TEST_URL))
    print(result)
