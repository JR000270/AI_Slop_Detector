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
