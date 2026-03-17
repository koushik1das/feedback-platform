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
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
import sys, os, uuid, requests as _requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import (
    AnalyseRequest, InsightsResponse, ChannelInfo,
    ChannelType, FeedbackItem, HelpdeskAnalyseRequest, HelpdeskType,
)
from ingestion.aggregator import aggregate_feedback, get_channel_sample_counts
from analysis.clustering import categorise_feedback
from analysis.insights import generate_insights
from ingestion.trino_helpdesk import fetch_helpdesk_insights, fetch_transcript, fetch_master_data, fetch_eval
from ingestion.trino_campaigns import fetch_campaign_list, fetch_campaign_analysis
from models import TranscriptMessage, MasterDataResponse, EvalResponse

router = APIRouter()

# ── In-memory App Store review sessions ───────────────────────────────────────
# session_id → {"items": List[FeedbackItem], "token": continuation_token}
_review_sessions: Dict[str, Dict[str, Any]] = {}


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
    For App Store, also seeds a session for Load More Reviews.
    """
    if not request.channels:
        raise HTTPException(status_code=400, detail="At least one channel is required.")

    try:
        session_id = None
        has_more   = None

        if ChannelType.APP_STORE in request.channels:
            # Fetch Google Play with pagination support
            from ingestion.sources import fetch_google_play, GOOGLE_PLAY_PACKAGE
            package = request.app_package or GOOGLE_PLAY_PACKAGE
            gp_items, next_token = fetch_google_play(count=200, package=package)
            items = gp_items

            # Store session for load-more
            session_id = str(uuid.uuid4())
            _review_sessions[session_id] = {"items": items, "token": next_token, "package": package}
            has_more = next_token is not None

            # Add other requested channels
            other = [c for c in request.channels if c != ChannelType.APP_STORE]
            if other:
                items += aggregate_feedback(other)
        else:
            items = aggregate_feedback(request.channels)

        categorised   = categorise_feedback(items)
        channel_names = [c.value for c in request.channels]
        insights      = generate_insights(categorised, channel_names)

        insights.session_id           = session_id
        insights.total_reviews_loaded = len(items)
        insights.has_more             = has_more

        return insights

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/app-store/load-more", response_model=InsightsResponse, tags=["analysis"])
def load_more_reviews(session_id: str = Query(...), count: int = Query(default=200)):
    """Fetch the next page of Google Play reviews and return updated insights."""
    session = _review_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    try:
        from ingestion.sources import fetch_google_play, GOOGLE_PLAY_PACKAGE
        pkg = session.get("package", GOOGLE_PLAY_PACKAGE)
        new_items, next_token = fetch_google_play(count=count, continuation_token=session["token"], package=pkg)

        all_items = session["items"] + new_items
        _review_sessions[session_id] = {"items": all_items, "token": next_token}

        categorised = categorise_feedback(all_items)
        insights    = generate_insights(categorised, ["app_store"])

        insights.session_id           = session_id
        insights.total_reviews_loaded = len(all_items)
        insights.has_more             = next_token is not None

        return insights

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load more failed: {str(e)}")


@router.post("/helpdesk/analyse", response_model=InsightsResponse, tags=["helpdesk"])
def analyse_helpdesk(request: HelpdeskAnalyseRequest):
    """
    Query Trino for the selected helpdesk type + product and return structured insights.
    Merchant products: loan, payments_settlement, soundbox
    Customer products: train, bus, flight
    """
    try:
        data = fetch_helpdesk_insights(request.product, request.helpdesk_type.value, request.date_range.value)
        return InsightsResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trino query failed: {str(e)}")


@router.get("/helpdesk/masterdata/{ticket_id}", response_model=MasterDataResponse, tags=["helpdesk"])
def get_master_data(ticket_id: str, helpdesk_type: HelpdeskType = HelpdeskType.MERCHANT):
    """Fetch parsed master data sections for a given helpdesk ticket ID."""
    try:
        result = fetch_master_data(ticket_id, helpdesk_type.value)
        if not result:
            raise HTTPException(status_code=404, detail="No master data found for this ticket.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Master data fetch failed: {str(e)}")


@router.get("/helpdesk/transcript/{ticket_id}", response_model=List[TranscriptMessage], tags=["helpdesk"])
def get_transcript(ticket_id: str, helpdesk_type: HelpdeskType = HelpdeskType.MERCHANT):
    """Fetch all conversation messages for a given helpdesk ticket ID."""
    try:
        return fetch_transcript(ticket_id, helpdesk_type.value)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcript fetch failed: {str(e)}")


@router.get("/helpdesk/eval/{ticket_id}", response_model=EvalResponse, tags=["helpdesk"])
def get_eval(ticket_id: str, helpdesk_type: HelpdeskType = HelpdeskType.MERCHANT):
    """Fetch eval score and categorised metrics for a given helpdesk ticket ID."""
    try:
        result = fetch_eval(ticket_id, helpdesk_type.value)
        if not result:
            raise HTTPException(status_code=404, detail="No eval data found for this ticket.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eval fetch failed: {str(e)}")


@router.get("/campaigns", tags=["campaigns"])
def list_campaigns(date_range: str = Query(default="last_7_days")):
    """List all outbound campaigns with summary stats."""
    try:
        return fetch_campaign_list(date_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Campaign list failed: {str(e)}")


@router.get("/campaigns/analyse", tags=["campaigns"])
def analyse_campaign(
    campaign: str = Query(...),
    date_range: str = Query(default="last_7_days"),
):
    """Return detailed analytics for a single outbound campaign."""
    try:
        return fetch_campaign_analysis(campaign, date_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Campaign analysis failed: {str(e)}")


@router.get("/campaigns/recording", tags=["campaigns"])
def stream_recording(recording_url: str = Query(...)):
    """Proxy a call recording WAV from S3 to bypass browser CORS restrictions."""
    try:
        r = _requests.get(recording_url, stream=True, timeout=15)
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Recording file not found in S3.")
        if r.status_code == 403:
            raise HTTPException(status_code=403, detail="Recording not accessible (S3 permission denied).")
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"S3 returned {r.status_code}.")
        return StreamingResponse(
            r.iter_content(chunk_size=8192),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recording fetch failed: {e}")


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
