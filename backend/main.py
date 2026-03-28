from fastapi import FastAPI, UploadFile, File
import os
import httpx
from helper import get_ai_or_not_api_key
from gemini_functions import generate_text, describe_image, get_available_models
import asyncio
from pydantic import BaseModel

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
    
    
class ImageURL(BaseModel):
    url: str
    type: str = "image"
    apiKey: str = ""

@app.post("/api/truthlens")
async def truthlens(req: ImageURL):
    async with httpx.AsyncClient() as client:
        # Download the image from the URL
        image_response = await client.get(req.url, timeout=15)
        
        if "image" not in image_response.headers.get("content-type", ""):
            return {"score": 0, "error": "Not an image"}

        # Send to AI-or-Not
        filename = req.url.split("/")[-1] or "image.jpg"
        response = await client.post(
            IMAGE_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"image": (filename, image_response.content, image_response.headers.get("content-type"))}
        )
        
        data = response.json()
        
        # Pull out the confidence score
        try:
            confidence = data["report"]["ai"]["confidence"]
            return {"score": confidence}  # api.js expects 0-1 float
        except:
            return {"score": 0, "error": "Could not parse AI-or-Not response"}