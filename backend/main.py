from fastapi import FastAPI, UploadFile, File
import os
import httpx
from helper import get_ai_or_not_api_key, download_image_from_url
from gemini_functions import generate_text, describe_image, get_available_models, analyze_youtube_video
import asyncio
from routes import image

app = FastAPI()
app.include_router(image.router)

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
        
    #print(result)
    #return response.json()
