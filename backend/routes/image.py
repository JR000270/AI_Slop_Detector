# routers/image.py
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from services.image_service import analyze_from_upload, analyze_from_url

router = APIRouter(prefix="/image", tags=["image"])

class ImageURL(BaseModel):
    url: str

@router.post("/")
async def upload_image(file: UploadFile = File(...)):
    return await analyze_from_upload(file)

@router.post("/url")
async def image_from_url(body: ImageURL):
    return await analyze_from_url(body.url)