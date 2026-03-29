import httpx
import json
import subprocess
from fastapi import HTTPException

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_ai_or_not_api_key

API_KEY = get_ai_or_not_api_key()
VIDEO_ENDPOINT = "https://api.aiornot.com/v2/video/sync"

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB in bytes
MAX_DURATION_SECONDS = 30


def _ffprobe_available() -> bool:
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False

FFPROBE_AVAILABLE = _ffprobe_available()


def _get_duration(contents: bytes) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-i", "pipe:0",
        ],
        input=contents,
        capture_output=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=400, detail="Could not read video metadata — ensure the file is a valid video")
    try:
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Could not determine video duration")


def _enforce_limits(contents: bytes):
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Video exceeds 200 MB limit")

    if FFPROBE_AVAILABLE:
        duration = _get_duration(contents)
        if duration > MAX_DURATION_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Video is {duration:.1f}s — exceeds the 30-second limit",
            )


async def analyze_video_from_upload(file):
    contents = await file.read()
    _enforce_limits(contents)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            VIDEO_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"video": (file.filename, contents, file.content_type)},
        )
        response.raise_for_status()
        return response.json()


async def analyze_video_from_url(url: str):
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            video_response = await client.get(url)
            video_response.raise_for_status()
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=400, detail="Could not fetch video from URL")
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Invalid URL or network error")

        contents = video_response.content
        _enforce_limits(contents)

        filename = url.split("?")[0].split("/")[-1] or "video.mp4"
        content_type = video_response.headers.get("content-type", "video/mp4")

        response = await client.post(
            VIDEO_ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"video": (filename, contents, content_type)},
        )
        response.raise_for_status()
        return response.json()
