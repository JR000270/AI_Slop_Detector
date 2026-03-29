from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from routes import image, video, factcheck

app = FastAPI()
app.include_router(image.router)
app.include_router(video.router)
app.include_router(factcheck.router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

