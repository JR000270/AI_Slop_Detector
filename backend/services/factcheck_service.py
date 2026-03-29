import asyncio
import json
import shutil
import subprocess
import sys
import os
import tempfile
import uuid
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from helper import get_gemini_api_key
from google import genai
from google.genai import types
from pydantic import BaseModel


class Article(BaseModel):
    title: str
    url: str
    snippet: str


class FactCheckResult(BaseModel):
    claims: list[str]
    factuality_score: int
    verdict: str
    explanation: str
    articles: list[Article]


class VideoTooLongResponse(BaseModel):
    detail: str
    duration: int
    download_token: str


MAX_VIDEO_SECONDS = 60

# Maps token -> temp file path for videos that were too long
_pending_downloads: dict[str, str] = {}

gemini_client = genai.Client(api_key=get_gemini_api_key())
MODEL = "gemini-2.5-flash"

CLAIMS_PROMPT = """Extract the key factual claims from the following content.
Return ONLY a JSON array of strings, each being one distinct factual claim.
Maximum 5 claims. No commentary."""

FACTCHECK_PROMPT_TEMPLATE = """You are a fact-checker. Given these claims: {claims}

Search the web and evaluate how factually accurate these claims are.
Respond with valid JSON only:
{{
  "factuality_score": <integer 0-100>,
  "verdict": "<False|Uncertain|Mostly True|True>",
  "explanation": "<2-3 sentence summary>"
}}"""


def _score_to_verdict(score: int) -> str:
    if score <= 30:
        return "False"
    elif score <= 60:
        return "Uncertain"
    elif score <= 85:
        return "Mostly True"
    else:
        return "True"


async def _extract_claims_from_parts(contents) -> list[str]:
    response = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=MODEL,
        contents=contents,
    )
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


async def _factcheck_claims(claims: list[str]) -> tuple[int, str, str, list[Article]]:
    prompt = FACTCHECK_PROMPT_TEMPLATE.format(claims=json.dumps(claims))

    response = await asyncio.to_thread(
        gemini_client.models.generate_content,
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        ),
    )

    # Extract articles from grounding metadata
    articles: list[Article] = []
    candidate = response.candidates[0]
    if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
        seen_urls: set[str] = set()
        for chunk in candidate.grounding_metadata.grounding_chunks:
            if chunk.web and chunk.web.uri and chunk.web.uri not in seen_urls:
                seen_urls.add(chunk.web.uri)
                articles.append(Article(
                    title=chunk.web.title or chunk.web.uri,
                    url=chunk.web.uri,
                    snippet="",
                ))
            if len(articles) == 5:
                break

    # Parse the JSON verdict from response text
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
        score = int(data.get("factuality_score", 50))
        verdict = data.get("verdict") or _score_to_verdict(score)
        explanation = data.get("explanation", "")
    except (json.JSONDecodeError, ValueError):
        score = 50
        verdict = "Uncertain"
        explanation = response.text

    return score, verdict, explanation, articles


async def factcheck_text(text: str) -> FactCheckResult:
    claims_contents = [
        types.Content(parts=[
            types.Part(text=CLAIMS_PROMPT),
            types.Part(text=text),
        ])
    ]
    claims = await _extract_claims_from_parts(claims_contents)
    score, verdict, explanation, articles = await _factcheck_claims(claims)
    return FactCheckResult(
        claims=claims,
        factuality_score=score,
        verdict=verdict,
        explanation=explanation,
        articles=articles,
    )


async def _get_video_duration(url: str) -> float:
    result = await asyncio.to_thread(
        subprocess.run,
        ["yt-dlp", "--dump-json", "--no-playlist", url],
        capture_output=True,
        text=True,
    )
    info = json.loads(result.stdout)
    return float(info["duration"])


async def _download_video(url: str, out_template: str) -> str:
    """Download video using yt-dlp. Returns the path of the downloaded file."""
    tmpdir = os.path.dirname(out_template)
    await asyncio.to_thread(
        subprocess.run,
        ["yt-dlp", "--no-playlist", "-o", out_template, url],
        check=True,
    )
    files = os.listdir(tmpdir)
    if not files:
        raise RuntimeError("yt-dlp produced no output file")
    return os.path.join(tmpdir, files[0])


async def factcheck_video_url(url: str) -> FactCheckResult | VideoTooLongResponse:
    duration = await _get_video_duration(url)

    if duration > MAX_VIDEO_SECONDS:
        tmpdir = tempfile.mkdtemp()
        video_path = await _download_video(url, os.path.join(tmpdir, "video.%(ext)s"))
        token = str(uuid.uuid4())
        _pending_downloads[token] = video_path
        return VideoTooLongResponse(
            detail=f"Video is {int(duration)} seconds long. Maximum supported length is {MAX_VIDEO_SECONDS} seconds. Trim it to under {MAX_VIDEO_SECONDS} seconds and use the file upload option.",
            duration=int(duration),
            download_token=token,
        )

    tmpdir = tempfile.mkdtemp()
    try:
        video_path = await _download_video(url, os.path.join(tmpdir, "video.%(ext)s"))

        uploaded = await asyncio.to_thread(
            gemini_client.files.upload,
            file=video_path,
            config=types.UploadFileConfig(
                mime_type="video/mp4",
                display_name="url_video.mp4",
            ),
        )

        try:
            for _ in range(20):
                file_info = await asyncio.to_thread(
                    gemini_client.files.get, name=uploaded.name
                )
                if file_info.state and file_info.state.name == "ACTIVE":
                    break
                await asyncio.sleep(2)

            claims_contents = types.Content(parts=[
                types.Part(file_data=types.FileData(file_uri=uploaded.uri)),
                types.Part(text=CLAIMS_PROMPT),
            ])
            claims = await _extract_claims_from_parts(claims_contents)
            score, verdict, explanation, articles = await _factcheck_claims(claims)
            return FactCheckResult(
                claims=claims,
                factuality_score=score,
                verdict=verdict,
                explanation=explanation,
                articles=articles,
            )
        finally:
            await asyncio.to_thread(gemini_client.files.delete, name=uploaded.name)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def factcheck_video_upload(file) -> FactCheckResult:
    contents = await file.read()

    uploaded = await asyncio.to_thread(
        gemini_client.files.upload,
        file=contents,
        config=types.UploadFileConfig(
            mime_type=file.content_type or "video/mp4",
            display_name=file.filename or "upload.mp4",
        ),
    )

    try:
        # Poll until file is ACTIVE
        for _ in range(20):
            file_info = await asyncio.to_thread(
                gemini_client.files.get, name=uploaded.name
            )
            if file_info.state and file_info.state.name == "ACTIVE":
                break
            await asyncio.sleep(2)

        claims_contents = types.Content(parts=[
            types.Part(file_data=types.FileData(file_uri=uploaded.uri)),
            types.Part(text=CLAIMS_PROMPT),
        ])
        claims = await _extract_claims_from_parts(claims_contents)
        score, verdict, explanation, articles = await _factcheck_claims(claims)
        return FactCheckResult(
            claims=claims,
            factuality_score=score,
            verdict=verdict,
            explanation=explanation,
            articles=articles,
        )
    finally:
        await asyncio.to_thread(gemini_client.files.delete, name=uploaded.name)
