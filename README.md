# slop-detector

A cross-browser extension + local backend for detecting AI-generated images, videos, and articles — with built-in fact-checking powered by Google Gemini and web search grounding.

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

![Demo](demo.gif)

## Overview

AI-generated media is increasingly realistic and widespread. slop-detector gives users instant, on-demand detection scores and fact-checks for any image, video, or article — right from their browser. It combines the AI-or-Not API for confidence scoring with Gemini-powered analysis for deeper inspection, running everything through a local FastAPI backend so API keys never touch the browser.

**Target users:** Journalists, researchers, educators, fact-checkers, and anyone who wants to verify the authenticity of online media.

---

## Features

### Image Detection
- **Right-click** any image to scan it instantly via context menu
- **Page picker** — interactively select any image with a visual overlay
- **File upload** — upload an image from your device
- **Batch scan** — scan every image on the current page at once with configurable sensitivity
- **Auto-scan** — optionally scan images automatically on page load
- **Inline badges** — color-coded confidence badges appear directly on the page

### Video Analysis
- **URL analysis** — paste any YouTube, TikTok, or direct video URL
- **File upload** — upload a video from your device (max 200 MB, 30 seconds)
- **Gemini analysis** — AI detection + structured fact-check of key claims with verdicts
- **Too-long handling** — videos over 60 seconds return a download token for a trimmed clip

### Article Fact-Check
- **Grab current page** — extracts article text from the active tab automatically
- **Paste text** — paste any article, headline, or content directly
- **AI detection** — score (0–100), writing pattern signals, and plain-English summary
- **Fact-check** — extracts claims, verifies them via Gemini with Google Search grounding, returns a verdict and source articles

### General
- **Scan history** — up to 50 past results with thumbnails, scores, and timestamps
- **Result caching** — 7-day TTL per URL so repeated scans are instant
- **Backend fallback** — if the local backend is unreachable, falls back directly to the AI-or-Not API
- **Connection indicator** — live status dot shows whether the backend is reachable

---

## Project Structure

```
AI_Slop_Detector/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, health endpoint
│   ├── helper.py               # API key loading from apikeys.env
│   ├── apikeys.env             # API keys (not committed)
│   ├── pyproject.toml          # Python dependencies (uv)
│   ├── routes/
│   │   ├── image.py            # /image endpoints
│   │   ├── video.py            # /video endpoints
│   │   ├── text.py             # /text endpoints
│   │   └── factcheck.py        # /factcheck endpoints
│   └── services/
│       ├── image_service.py    # AI-or-Not + Gemini image logic
│       ├── video_service.py    # AI-or-Not + Gemini video logic
│       ├── text_service.py     # Gemini text AI detection
│       └── factcheck_service.py# Gemini claim extraction + web-grounded fact-check
└── frontend/
    ├── manifest.json           # MV3 extension manifest
    ├── background/
    │   └── background.js       # Service worker, message bus, context menu
    ├── content/
    │   ├── content.js          # Page badges, element picker, image collection
    │   └── content.css         # Badge and overlay styles
    ├── popup/
    │   ├── popup.html          # Popup UI — Image, Video, Article tabs
    │   ├── popup.js            # Tab logic, API calls, result rendering
    │   └── popup.css           # Popup styles with dark mode support
    └── utils/
        └── api.js              # Fetch utilities, score normalization, caching
```

---

## Setup

### Prerequisites

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (or pip)
- Chrome or Firefox
- [AI-or-Not API key](https://aiornot.com)
- Google Gemini API key

### Backend

```bash
cd backend
uv venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
uv sync
```

Create `backend/apikeys.env`:

```env
AIORNOT_KEY=your_aiornot_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Start the server:

```bash
uvicorn main:app --reload
```

Confirm it's running: `http://localhost:8000/health`

> **Optional:** Install `ffprobe` (part of FFmpeg) to enable video duration enforcement on uploads. Install `yt-dlp` for downloading YouTube/TikTok/Instagram videos for fact-checking.

### Frontend

**Chrome / Chromium:**
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `frontend/` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `frontend/manifest.json`

---

## Configuration

Open the extension popup. Settings are accessible via the browser's extension settings or the Settings tab (if present):

| Setting | Description | Default |
|---|---|---|
| AI-or-Not API Key | Direct fallback key used when the backend is unreachable | — |
| Backend Endpoint | URL of the local FastAPI server | `http://localhost:8000` |
| Auto-scan on page load | Proactively scan images when a page loads | Off |
| Sensitivity | Minimum image size included in batch/auto scans (High: 0px, Medium: 150px, Low: 350px) | Medium |

**Keyboard shortcut:** `Ctrl+Shift+U` / `Cmd+Shift+U` — open the popup

---

## API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status": "ok", "timestamp": "..."}` |

### Image (`/image`)
| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/image/` | `file: UploadFile` | Detect AI in uploaded image (AI-or-Not) |
| `POST` | `/image/url` | `{"url": "..."}` | Detect AI in image by URL (AI-or-Not) |
| `POST` | `/image/gemini/upload` | `file: UploadFile` | Describe uploaded image with Gemini |
| `POST` | `/image/gemini/url` | `{"url": "..."}` | Describe image by URL with Gemini |
| `POST` | `/image/gemini/youtube` | `{"url": "..."}` | Analyze YouTube video with Gemini |

### Video (`/video`)
| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/video/` | `file: UploadFile` | Detect AI in uploaded video (max 200 MB, 30s) |
| `POST` | `/video/url` | `{"url": "..."}` | Detect AI in video by URL (AI-or-Not) |
| `POST` | `/video/gemini/upload` | `file: UploadFile` | Upload video → Gemini AI detection + fact-check |
| `POST` | `/video/gemini/url` | `{"url": "..."}` | Video URL → Gemini AI detection + fact-check |

### Text (`/text`)
| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/text/analyze` | `{"text": "...", "url": "...?"}` | AI detection on text — returns score, signals, claims, summary |

### Fact-Check (`/factcheck`)
| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/factcheck/text` | `{"text": "..."}` | Extract claims + web-grounded fact-check |
| `POST` | `/factcheck/video/url` | `{"url": "..."}` | Download video → extract claims → fact-check (returns download token if >60s) |
| `POST` | `/factcheck/video` | `file: UploadFile` | Upload video → extract claims → fact-check |
| `GET` | `/factcheck/video/download/{token}` | — | Download a trimmed video clip |

#### Text Analysis Response
```json
{
  "verdict": "likely_real | uncertain | likely_ai",
  "ai_score": 42,
  "ai_signals": ["no named sources", "generic list structure"],
  "claims": [{"text": "...", "assessment": "supported | contradicted | unverifiable", "explanation": "..."}],
  "summary": "Plain English summary of findings."
}
```

#### Fact-Check Response
```json
{
  "claims": ["Claim one", "Claim two"],
  "factuality_score": 75,
  "verdict": "Mostly True",
  "explanation": "2–3 sentence summary.",
  "articles": [{"title": "...", "url": "...", "snippet": ""}]
}
```

---

## Score Interpretation

Scores represent the **likelihood the content is real** (not AI-generated):

| Score | Label | Meaning |
|---|---|---|
| 61–100% | Likely Real | Low AI signal |
| 31–60% | Uncertain | Mixed signals |
| 0–30% | Likely AI-Generated | High AI signal |

For **fact-check verdicts:**

| Verdict | Factuality Score |
|---|---|
| True | 86–100 |
| Mostly True | 61–85 |
| Uncertain | 31–60 |
| False | 0–30 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser extension | Vanilla JS, Manifest V3 |
| Backend framework | Python, FastAPI, Uvicorn |
| Image/video detection | AI-or-Not API v2 |
| AI analysis & fact-check | Google Gemini 2.5 Flash |
| Web search grounding | Gemini Google Search tool |
| Video download | yt-dlp |
| Video metadata | ffprobe (optional) |
| HTTP client (backend) | httpx |
| HTTP client (frontend) | fetch API |
| Image processing | Pillow |
| Data validation | Pydantic v2 |
