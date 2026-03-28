from fastapi import FastAPI
import os
import httpx
from helper import get_ai_or_not_api_key
import asyncio

app = FastAPI()

IMAGE =  "./images/Ballerina-Cappuccina.webp"
API_KEY = get_ai_or_not_api_key()

IMAGE_ENDPOINT = "https://api.aiornot.com/v2/image/sync"
@app.get("/")
def read_root():
    return {"message": "Hello, World"}

# @app.post("/image")
async def send_image(image):
    async with httpx.AsyncClient() as client:
        with open(image, "rb") as f:
            response = await client.post(
                IMAGE_ENDPOINT,
                headers={"Authorization": f"Bearer {API_KEY}"},
                files={"image": f}
            )
            print("RESPONSE TYPE:", type(response))
            print("RESPONSE JSON:", response.json())
            return response.json()
        
if __name__ == "__main__":
    result = asyncio.run(send_image(IMAGE))
    
    print(result)