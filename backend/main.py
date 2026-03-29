from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import image
from routes import image, text 

app = FastAPI()
app.include_router(image.router)
app.include_router(text.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

