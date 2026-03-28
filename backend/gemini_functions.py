#import google.genai as genai
from PIL import Image
from helper import get_gemini_api_key

from google import genai

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

def describe_image(image_path: str) -> str:
    image = Image.open(image_path)
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            "Describe this image in detail.",
            image
        ]
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