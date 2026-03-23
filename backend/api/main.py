"""
FastAPI application entry point.

Start with:
    uvicorn api.main:app --host 0.0.0.0 --port 8081
    (for development add --reload)
"""

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.routes import router
from api.auth import auth_router

app = FastAPI(
    title="Customer Feedback Intelligence Platform",
    description=(
        "Aggregates customer feedback across channels, "
        "runs NLP analysis, and surfaces top pain points."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — set CORS_ORIGINS in .env to restrict (comma-separated).
# Defaults to ["*"] for development; tighten for production.
_raw_origins = os.getenv("CORS_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")


@app.get("/", tags=["health"])
def root():
    return {
        "service": "Customer Feedback Intelligence Platform",
        "status": "running",
        "version": "1.0.0",
    }
