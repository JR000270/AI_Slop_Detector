from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.video_service import (
    analyze_video_from_upload,
    analyze_video_from_url,
    analyze_video_with_gemini,
    analyze_video_url_with_gemini,
)

ALLOWED_EXTENSIONS = {
    "mp4", "mov", "mkv", "webm", "avi", "flv", "gif",
    "m4v", "mpeg", "mpg", "mxf", "ts", "vob", "wmv", "3gp",
}

router = APIRouter(prefix="/video", tags=["video"])


class VideoURL(BaseModel):
    url: str


def _validate_extension(filename: str):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


@router.post("/")
async def upload_video(file: UploadFile = File(...)):
    _validate_extension(file.filename or "")
    return await analyze_video_from_upload(file)


@router.post("/url")
async def video_from_url(body: VideoURL):
    return await analyze_video_from_url(body.url)


@router.post("/gemini/upload")
async def gemini_video_upload(file: UploadFile = File(...)):
    analysis = await analyze_video_with_gemini(file)
    return {"analysis": analysis}


@router.post("/gemini/url")
async def gemini_video_url(body: VideoURL):
    analysis = await analyze_video_url_with_gemini(body.url)
    return {"analysis": analysis}
