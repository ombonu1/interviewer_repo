from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Import your new routers
from routers import chat, reviewer, client
from core.config import setup_directories, logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting RDEC AIF Backend Server...")
    setup_directories() # Creates your folders on startup
    yield
    logger.info("🛑 Shutting down server...")

app = FastAPI(lifespan=lifespan)

# CORS Setup
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔌 Plug in the separate files!
app.include_router(chat.router, prefix="/api/chat", tags=["Interviewer"])
app.include_router(client.router, prefix="/api", tags=["Client UI"])
app.include_router(reviewer.router, prefix="/api/reviewer", tags=["Tax Team"])