from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.image_service import analyze_image, analyze_image_url

router = APIRouter(prefix="/image", tags=["image"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}


class ImageURLBody(BaseModel):
    url: str


@router.post("/url")
async def analyze_image_url_route(body: ImageURLBody):
    return await analyze_image_url(body.url)


@router.post("/analyze")
async def analyze_image_route(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: jpeg, png, webp, gif, bmp",
        )

    image_bytes = await file.read()
    return await analyze_image(image_bytes, file.content_type)
import io
from PIL import Image
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from services.image_service import (
    analyze_from_upload,
    analyze_from_url,
    analyze_image_with_gemini,
    analyze_youtube_with_gemini,
)

router = APIRouter(prefix="/image", tags=["image"])

class ImageURL(BaseModel):
    url: str

@router.post("/")
async def upload_image(file: UploadFile = File(...)):
    return await analyze_from_upload(file)

@router.post("/url")
async def image_from_url(body: ImageURL):
    return await analyze_from_url(body.url)

# New Gemini routes
@router.post("/gemini/upload")
async def gemini_upload(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))
    result = await analyze_image_with_gemini(image)
    return {"description": result}

@router.post("/gemini/url")
async def gemini_url(body: ImageURL):
    result = await analyze_image_with_gemini(body.url)
    return {"description": result}

@router.post("/gemini/youtube")
async def gemini_youtube(body: ImageURL):
    result = await analyze_youtube_with_gemini(body.url)
    return {"analysis": result}
