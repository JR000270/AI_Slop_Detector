import asyncio
import io
import httpx
import json
import os
import shutil
import subprocess
import tempfile
from fastapi import HTTPException
from google import genai
from google.genai import types

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helper import get_ai_or_not_api_key, get_gemini_api_key

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


# ── Gemini video analysis ─────────────────────────────────────────────────────

_gemini_client = None

def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=get_gemini_api_key())
    return _gemini_client

_VIDEO_PROMPT = """\
Analyze this video carefully. Respond using EXACTLY the following format — \
no extra headings, no markdown, no preamble:

AI DETECTION: <Yes / No / Uncertain> — <one sentence explaining the visual or audio evidence>

FACT CHECK:
Verdict: <True / False / Misleading / Unverified>
Summary: <2-3 sentences: what specific claims does the video make, and are they accurate?>
Claims:
• <exact claim from video> — <True / False / Uncertain>
• <exact claim from video> — <True / False / Uncertain>
• <exact claim from video> — <True / False / Uncertain>

RULES:
- Output ONLY the above structure. Do not add extra text before or after.
- If the video makes no specific verifiable claims, write one Claims bullet: \
"No specific verifiable claims detected — N/A"
- Use the em dash (—) as the separator between a claim and its verdict.
- Limit claims to the 3 most important ones.
"""


async def _poll_until_active(name: str):
    for _ in range(20):
        info = await asyncio.to_thread(_get_gemini_client().files.get, name=name)
        if info.state and info.state.name == "ACTIVE":
            return
        await asyncio.sleep(2)


async def analyze_video_with_gemini(file) -> str:
    contents = await file.read()
    uploaded = await asyncio.to_thread(
        _get_gemini_client().files.upload,
        file=io.BytesIO(contents),
        config=types.UploadFileConfig(
            mime_type=file.content_type or "video/mp4",
            display_name=file.filename or "video.mp4",
        ),
    )
    try:
        await _poll_until_active(uploaded.name)
        response = await asyncio.to_thread(
            _get_gemini_client().models.generate_content,
            model="gemini-2.5-flash",
            contents=types.Content(parts=[
                types.Part(file_data=types.FileData(file_uri=uploaded.uri)),
                types.Part(text=_VIDEO_PROMPT),
            ]),
        )
        return response.text.strip()
    finally:
        await asyncio.to_thread(_get_gemini_client().files.delete, name=uploaded.name)


_SOCIAL_HOSTS = ("instagram.com", "tiktok.com", "vm.tiktok.com")

def _is_social_platform(url: str) -> bool:
    return any(host in url for host in _SOCIAL_HOSTS)


def _download_with_ytdlp(url: str, out_template: str) -> str:
    """Synchronous yt-dlp download. Returns path to the downloaded file."""
    tmpdir = os.path.dirname(out_template)
    subprocess.run(
        ["yt-dlp", "--no-playlist", "-o", out_template, url],
        check=True,
        capture_output=True,
    )
    files = os.listdir(tmpdir)
    if not files:
        raise RuntimeError("yt-dlp produced no output file")
    return os.path.join(tmpdir, files[0])


async def _upload_file_and_analyze(video_path: str, mime_type: str) -> str:
    """Upload a local file to Gemini Files API and run analysis."""
    uploaded = await asyncio.to_thread(
        _get_gemini_client().files.upload,
        file=video_path,
        config=types.UploadFileConfig(
            mime_type=mime_type,
            display_name=os.path.basename(video_path),
        ),
    )
    try:
        await _poll_until_active(uploaded.name)
        response = await asyncio.to_thread(
            _get_gemini_client().models.generate_content,
            model="gemini-2.5-flash",
            contents=types.Content(parts=[
                types.Part(file_data=types.FileData(file_uri=uploaded.uri)),
                types.Part(text=_VIDEO_PROMPT),
            ]),
        )
        return response.text.strip()
    finally:
        await asyncio.to_thread(_get_gemini_client().files.delete, name=uploaded.name)


async def analyze_video_url_with_gemini(url: str) -> str:
    # YouTube: Gemini handles natively, no download needed
    if "youtube.com" in url or "youtu.be" in url:
        response = await asyncio.to_thread(
            _get_gemini_client().models.generate_content,
            model="gemini-2.5-flash",
            contents=types.Content(parts=[
                types.Part(file_data=types.FileData(file_uri=url)),
                types.Part(text=_VIDEO_PROMPT),
            ]),
        )
        return response.text.strip()

    # Social platforms always require yt-dlp; other URLs try direct fetch first
    use_ytdlp = _is_social_platform(url)

    if not use_ytdlp:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except Exception:
                raise HTTPException(status_code=400, detail="Could not fetch video from URL")

        content_type = resp.headers.get("content-type", "")
        if content_type.startswith("text/") or "html" in content_type:
            # Got a web page instead of video bytes — fall back to yt-dlp
            use_ytdlp = True
        else:
            filename = url.split("?")[0].split("/")[-1] or "video.mp4"
            uploaded = await asyncio.to_thread(
                _get_gemini_client().files.upload,
                file=io.BytesIO(resp.content),
                config=types.UploadFileConfig(
                    mime_type=content_type or "video/mp4",
                    display_name=filename,
                ),
            )
            try:
                await _poll_until_active(uploaded.name)
                response = await asyncio.to_thread(
                    _get_gemini_client().models.generate_content,
                    model="gemini-2.5-flash",
                    contents=types.Content(parts=[
                        types.Part(file_data=types.FileData(file_uri=uploaded.uri)),
                        types.Part(text=_VIDEO_PROMPT),
                    ]),
                )
                return response.text.strip()
            finally:
                await asyncio.to_thread(_get_gemini_client().files.delete, name=uploaded.name)

    # yt-dlp download path (social platforms + HTML fallback)
    tmpdir = tempfile.mkdtemp()
    try:
        try:
            video_path = await asyncio.to_thread(
                _download_with_ytdlp,
                url,
                os.path.join(tmpdir, "video.%(ext)s"),
            )
        except subprocess.CalledProcessError:
            raise HTTPException(
                status_code=400,
                detail="Could not download video — the URL may be private or unsupported",
            )

        ext = os.path.splitext(video_path)[1].lstrip(".").lower() or "mp4"
        mime_type = f"video/{ext}"

        return await _upload_file_and_analyze(video_path, mime_type)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
