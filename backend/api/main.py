"""
FastAPI application entry point.

Start with:
    uvicorn api.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.routes import router

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

# Allow the React dev server (port 3000) and any other origin in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/", tags=["health"])
def root():
    return {
        "service": "Customer Feedback Intelligence Platform",
        "status": "running",
        "version": "1.0.0",
    }
