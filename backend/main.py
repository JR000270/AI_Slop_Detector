from fastapi import FastAPI, UploadFile, File
import os
import httpx
from helper import get_ai_or_not_api_key
from gemini_functions import generate_text, describe_image, get_available_models
import asyncio

app = FastAPI()

IMAGE =  "./images/fake_image.jpg"
API_KEY = get_ai_or_not_api_key()

IMAGE_ENDPOINT = "https://api.aiornot.com/v2/image/sync"
@app.get("/")
def read_root():
    return {"message": "Hello, World"}

@app.post("/api/image")
async def send_image(file: UploadFile = File(...)):
      async with httpx.AsyncClient() as client:
        contents = await file.read()
        response = await client.post(
            IMAGE_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"image": (file.filename, contents, file.content_type)}
        )

        return response.json()
        
if __name__ == "__main__":
    result = asyncio.run(send_image(IMAGE))
    
    #print(result)
    #return response.json()
