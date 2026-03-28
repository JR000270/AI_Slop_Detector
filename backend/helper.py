import os
from dotenv import load_dotenv

def get_ai_or_not_api_key():
    load_dotenv("apikeys.env")
    ai_or_not_api_key = os.getenv("AIORNOT_KEY")
    return ai_or_not_api_key

def get_gemini_api_key():
    load_dotenv("apikeys.env")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    return gemini_api_key