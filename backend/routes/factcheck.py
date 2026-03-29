import os
import shutil
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from services.factcheck_service import (
    FactCheckResult,
    VideoTooLongResponse,
    _pending_downloads,
    factcheck_text,
    factcheck_video_url,
    factcheck_video_upload,
)

router = APIRouter(prefix="/factcheck", tags=["factcheck"])

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}


def _validate_video_extension(filename: str) -> None:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}",
        )


class TextInput(BaseModel):
    text: str


class VideoURLInput(BaseModel):
    url: str


@router.post("/text", response_model=FactCheckResult)
async def factcheck_text_route(body: TextInput):
    return await factcheck_text(body.text)


@router.post("/video/url", response_model=FactCheckResult | VideoTooLongResponse)
async def factcheck_video_url_route(body: VideoURLInput):
    return await factcheck_video_url(body.url)


@router.get("/video/download/{token}")
async def download_video_clip(token: str, background_tasks: BackgroundTasks):
    path = _pending_downloads.get(token)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Download token not found or expired.")

    def cleanup():
        _pending_downloads.pop(token, None)
        shutil.rmtree(os.path.dirname(path), ignore_errors=True)

    background_tasks.add_task(cleanup)
    return FileResponse(path, media_type="video/mp4", filename="clip.mp4")


@router.post("/video", response_model=FactCheckResult)
async def factcheck_video_upload_route(file: UploadFile = File(...)):
    _validate_video_extension(file.filename or "upload.mp4")
    return await factcheck_video_upload(file)
