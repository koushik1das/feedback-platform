"""
API Route Definitions.

All routes are prefixed with /api (see main.py).

Endpoints:
  GET  /api/channels          – List all available channels with metadata
  POST /api/analyse           – Analyse feedback for selected channels
  GET  /api/feedback          – Fetch raw feedback items (with optional filter)
  GET  /api/health            – Health check
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import (
    AnalyseRequest, InsightsResponse, ChannelInfo,
    ChannelType, FeedbackItem,
)
from ingestion.aggregator import aggregate_feedback, get_channel_sample_counts
from analysis.clustering import categorise_feedback
from analysis.insights import generate_insights

router = APIRouter()


# ── Channel metadata ──────────────────────────────────────────────────────────

def _channel_metadata() -> List[ChannelInfo]:
    counts = get_channel_sample_counts()
    return [
        ChannelInfo(
            id=ChannelType.APP_STORE,
            name="App Store",
            description="iOS App Store & Google Play reviews",
            icon="star",
            sample_count=counts.get(ChannelType.APP_STORE, 0),
        ),
        ChannelInfo(
            id=ChannelType.SOCIAL_MEDIA,
            name="Social Media",
            description="Twitter/X and Facebook posts",
            icon="share",
            sample_count=counts.get(ChannelType.SOCIAL_MEDIA, 0),
        ),
        ChannelInfo(
            id=ChannelType.HELPDESK,
            name="Help Desk",
            description="Zendesk / Freshdesk support tickets",
            icon="headphones",
            sample_count=counts.get(ChannelType.HELPDESK, 0),
        ),
        ChannelInfo(
            id=ChannelType.EMAIL,
            name="Email",
            description="Customer support email inbox",
            icon="mail",
            sample_count=counts.get(ChannelType.EMAIL, 0),
        ),
        ChannelInfo(
            id=ChannelType.CHATBOT,
            name="Chatbot",
            description="Conversational AI / chatbot session logs",
            icon="message-circle",
            sample_count=counts.get(ChannelType.CHATBOT, 0),
        ),
    ]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}


@router.get("/channels", response_model=List[ChannelInfo], tags=["channels"])
def list_channels():
    """Return metadata for all supported feedback channels."""
    return _channel_metadata()


@router.post("/analyse", response_model=InsightsResponse, tags=["analysis"])
def analyse_channels(request: AnalyseRequest):
    """
    Fetch feedback from the requested channels, run NLP analysis,
    and return structured insights.
    """
    if not request.channels:
        raise HTTPException(status_code=400, detail="At least one channel is required.")

    try:
        # 1. Fetch & aggregate
        items = aggregate_feedback(request.channels)

        # 2. Categorise + sentiment
        categorised = categorise_feedback(items)

        # 3. Generate insights
        channel_names = [c.value for c in request.channels]
        insights = generate_insights(categorised, channel_names)

        return insights

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/feedback", response_model=List[FeedbackItem], tags=["feedback"])
def get_feedback(
    channels: Optional[List[ChannelType]] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    Return raw (unenriched) feedback items for the given channels.
    Useful for the raw feed table in the dashboard.
    """
    target_channels = channels or list(ChannelType)
    try:
        items = aggregate_feedback(target_channels)
        return items[offset: offset + limit]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
