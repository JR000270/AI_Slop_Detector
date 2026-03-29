from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from routes import image, video

app = FastAPI()
app.include_router(image.router)
app.include_router(video.router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

