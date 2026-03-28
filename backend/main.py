from fastapi import FastAPI, UploadFile, File
import os
import httpx
from helper import get_ai_or_not_api_key
from gemini_functions import generate_text, describe_image, get_available_models
import asyncio
from routes import image

app = FastAPI()
app.include_router(image.router)

@app.get("/")
def read_root():
    return {"message": "Hello, World"}

    
    #print(result)
    #return response.json()
