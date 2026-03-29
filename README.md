# Plato AI

A cross-browser extension that empowers users to detect AI-generated images and videos directly in their browsing experience.

## Overview

AI-generated media is increasingly realistic and widespread, making it nearly impossible for the average person to distinguish real from fake content. Plato AI addresses this by giving users instant, on-demand AI detection scores for any image or video — right from their browser context menu.

By integrating with the AI-or-Not API and Google Gemini, users can right-click any image or video on a webpage and receive a confidence score indicating the likelihood that the content is real. The higher the score, the more likely the content is genuine.

**Target users:** Journalists, educators, social media users, fact-checkers, and anyone concerned about the authenticity of online media.

---

## Features

- **Right-click detection** — context menu on any image or video triggers an instant scan
- **Page picker** — click any image on a page interactively with a visual overlay
- **File upload** — upload an image or video from your device for local analysis
- **Video analysis** — paste a video URL for AI-powered content analysis via Gemini
- **Batch scan** — scan all images on the current page at once with configurable sensitivity
- **Confidence gauge** — visual arc gauge showing realness score (0% = AI-generated, 100% = real)
- **Scan history** — browsing history of previously scanned media with scores and timestamps
- **Auto-scan** — optional proactive scanning on page load
- **Local backend** — all API calls route through a local FastAPI server, keeping your API keys off the browser

---

## Project Structure

```
AI_Slop_Detector/
├── backend/                  # FastAPI local backend (OpenClaw)
│   ├── main.py               # App entry point, CORS, health endpoint
│   ├── helper.py             # API key loading utilities
│   ├── routes/
│   │   └── image.py          # /image endpoints (upload, URL, Gemini)
│   ├── services/
│   │   └── image_service.py  # AI-or-Not + Gemini API logic
│   └── apikeys.env           # API keys (not committed)
└── frontend/                 # Browser extension (Manifest V3)
    ├── manifest.json
    ├── background/
    │   └── background.js     # Service worker, message bus, context menu
    ├── content/
    │   ├── content.js        # Page overlay, badge rendering, image picker
    │   └── content.css
    ├── popup/
    │   ├── popup.html
    │   ├── popup.js          # Popup UI logic
    │   └── popup.css
    └── utils/
        └── api.js            # Shared fetch utilities, score normalization, cache
```

---

## Setup

### Prerequisites

- Python 3.10+
- A modern browser (Chrome or Firefox)
- [AI-or-Not API key](https://aiornot.com)
- Google Gemini API key (for video analysis)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
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

The backend runs at `http://localhost:8000`. Confirm it's live at `http://localhost:8000/health`.

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

Open the extension popup and go to the **Settings** tab:

| Setting | Description | Default |
|---|---|---|
| AI-or-Not API Key | Direct fallback key if backend is unreachable | — |
| OpenClaw Endpoint | URL of the local FastAPI backend | `http://localhost:8000` |
| Auto-scan on page load | Proactively scan images when a page loads | Off |
| Sensitivity | Minimum image size to include in batch/auto scans | Medium |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/image/` | Analyze an uploaded image file |
| `POST` | `/image/url` | Analyze an image by URL |
| `POST` | `/image/gemini/url` | Describe an image via Gemini |
| `POST` | `/image/gemini/upload` | Describe an uploaded image via Gemini |
| `POST` | `/image/gemini/youtube` | Analyze a video URL via Gemini |

---

## Score Interpretation

Scores represent the **likelihood the content is real** (not AI-generated):

| Score | Label | Meaning |
|---|---|---|
| 61 – 100% | Likely Real | Low AI signal detected |
| 31 – 60% | Uncertain | Mixed signals |
| 0 – 30% | Likely AI-Generated | High AI signal detected |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Vanilla JS, Manifest V3 |
| Backend | Python, FastAPI, Uvicorn |
| Image detection | AI-or-Not API v2 |
| Video analysis | Google Gemini |
| HTTP client | httpx (backend), fetch (frontend) |
