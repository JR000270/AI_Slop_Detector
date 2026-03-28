import os
from dotenv import load_dotenv

def get_ai_or_not_api_key():
    load_dotenv("api_keys.env")
    ai_or_not_api_key = os.getenv("AIORNOT_KEY")
    return ai_or_not_api_key

def get_gemini_api_key():
    load_dotenv("api_keys.env")
    gemini_api_key = os.getenv("GEMINI_KEY")
    return gemini_api_key