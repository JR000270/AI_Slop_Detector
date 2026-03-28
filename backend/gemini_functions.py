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
        model="gemini-2.0-flash-lite",
        contents=[
            "Describe this image in detail.",
            image
        ]
    )
    return response.text
