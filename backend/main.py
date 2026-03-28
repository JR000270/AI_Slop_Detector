from fastapi import FastAPI, UploadFile, File
import os
import httpx
from helper import get_ai_or_not_api_key
from gemini_functions import generate_text, describe_image, get_available_models
import asyncio
from pydantic import BaseModel

app = FastAPI()
app.include_router(image.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

