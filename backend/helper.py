import os
from dotenv import load_dotenv

def get_ai_or_not_api_key():
    dotenv_path = os.path.join(os.path.dirname(__file__), "apikeys.env")
    loaded = load_dotenv(dotenv_path)
    print(f"Loaded: {loaded}, Path: {dotenv_path}")
    return os.getenv("AIORNOT_KEY")

def get_gemini_api_key():
    load_dotenv("api_keys.env")
    gemini_api_key = os.getenv("GEMINI_KEY")
    return gemini_api_key
