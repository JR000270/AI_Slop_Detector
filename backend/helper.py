import os
from dotenv import load_dotenv
import httpx
from PIL import Image
from io import BytesIO

def get_ai_or_not_api_key():
    load_dotenv("apikeys.env")
    dotenv_path = os.path.join(os.path.dirname(__file__), "apikeys.env")
    loaded = load_dotenv(dotenv_path)
    print(f"Loaded: {loaded}, Path: {dotenv_path}")
    return os.getenv("AIORNOT_KEY")

def get_gemini_api_key():
    load_dotenv("apikeys.env")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    return gemini_api_key

def download_image_from_url(url: str) -> Image.Image:
    response = httpx.get(url)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content))
    return image