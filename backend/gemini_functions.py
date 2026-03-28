#import google.genai as genai
from PIL import Image
from helper import get_gemini_api_key

from google import genai
from google.genai import types

# The client automatically picks up the API key from the environment variable 'GEMINI_API_KEY'
client = genai.Client(api_key=get_gemini_api_key())

def generate_text(prompt_text):
    """Generates text from a given prompt using the Gemini API."""
    try:
        response = client.models.generate_content(
            model="gemini-1.5-flash", # Specify the model you want to use
            contents=prompt_text,
        )
        print(response.text)
    except Exception as e:
        print(f"An error occurred: {e}")


def describe_image(image_input: str | Image.Image) -> str:
    # Accept either a file path or an already-loaded PIL image
    if isinstance(image_input, str):
        image = Image.open(image_input)
    else:
        image = image_input
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            "In 30 words or less explain if this image is AI generated or not and why.",
            image
        ]
    )
    return response.text

def analyze_youtube_video(url: str) -> str:
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=types.Content(
            parts=[
                types.Part(
                    file_data=types.FileData(file_uri=url)
                ),
                types.Part(text="Analyze this video and determine if it was made with or by AI. Look for signs like unnatural movements, inconsistent lighting, strange audio, digital artifacts, or anything else that suggests AI generation. Give a clear verdict and explain your reasoning.")
            ]
        )
    )
    return response.text

def get_available_models():
    """Fetches and prints the list of available models from the Gemini API."""
    try:
        models = client.models.list()
        print("Available Models:")
        for model in models:
            print(model.name)
    except Exception as e:
        print(f"An error occurred while fetching models: {e}")