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
from openai import OpenAI as _OpenAI
from pydantic import BaseModel as _BaseModel
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import (
    AnalyseRequest, InsightsResponse, ChannelInfo,
    ChannelType, FeedbackItem, HelpdeskAnalyseRequest, HelpdeskType,
)
from ingestion.aggregator import aggregate_feedback, get_channel_sample_counts
from analysis.clustering import categorise_feedback
from analysis.insights import generate_insights
from ingestion.trino_helpdesk import fetch_helpdesk_insights, fetch_transcript, fetch_master_data, fetch_eval, fetch_function_calls, fetch_session_lookup
from ingestion.loki import fetch_session_timeline
from ingestion.trino_campaigns import fetch_campaign_list, fetch_campaign_analysis, fetch_ivr_insights, fetch_soundbox_insights
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


@router.get("/helpdesk/function-calls/{ticket_id}", tags=["helpdesk"])
def get_function_calls(ticket_id: str, helpdesk_type: HelpdeskType = HelpdeskType.MERCHANT):
    """Fetch function call outputs and full transcript rows for a given ticket/session ID."""
    try:
        return fetch_function_calls(ticket_id, helpdesk_type.value)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Function calls fetch failed: {str(e)}")


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


@router.get("/helpdesk/session-lookup/{session_id}", tags=["helpdesk"])
def session_lookup(session_id: str):
    """Look up a single session by ID across merchant and customer tables."""
    try:
        result = fetch_session_lookup(session_id)
        if not result:
            raise HTTPException(status_code=404, detail="Session not found.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Session lookup failed: {str(e)}")


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


# ── IVR category → cst_entity mapping ────────────────────────────────────────
_IVR_CATEGORY_MAP: Dict[str, List[str]] = {
    "loan":               ["p4bbusinessloan"],
    "payout_settlement":  ["p4bpayoutandsettlement"],
    "soundbox":           ["p4bsoundbox", "p4bsoundboxdeactivation", "p4bAIBot"],
    "edc":                ["p4bedc"],
    "profile":            ["p4bprofile"],
    "wealth":             ["p4bwealth"],
}


@router.get("/ivr/analyse", response_model=InsightsResponse, tags=["ivr"])
def analyse_ivr(
    category: str = Query(...),
    date_range: str = Query(default="last_7_days"),
):
    """Return inbound IVR analytics for the given category."""
    entities = _IVR_CATEGORY_MAP.get(category)
    if not entities:
        raise HTTPException(status_code=400, detail=f"Unknown IVR category: {category}")
    try:
        data = fetch_ivr_insights(entities, date_range)
        return InsightsResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"IVR analysis failed: {str(e)}")


_SOUNDBOX_CATEGORY_MAP: Dict[str, List[str]] = {
    "payout_settlement": ["p4bpayoutandsettlement"],
    "soundbox":          ["p4bsoundbox"],
    "loan":              ["p4bbusinessloan"],
    "profile":           ["p4bprofile"],
}


@router.get("/soundbox/analyse", response_model=InsightsResponse, tags=["soundbox"])
def analyse_soundbox(
    category: str = Query(...),
    date_range: str = Query(default="last_7_days"),
):
    """Return AI Soundbox analytics for the given category."""
    entities = _SOUNDBOX_CATEGORY_MAP.get(category)
    if not entities:
        raise HTTPException(status_code=400, detail=f"Unknown Soundbox category: {category}")
    try:
        data = fetch_soundbox_insights(entities, date_range)
        return InsightsResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Soundbox analysis failed: {str(e)}")


class _SummariseRequest(_BaseModel):
    label: str
    comments: List[str]

class _SummariseResponse(_BaseModel):
    pain_points: List[str]
    suggestions: List[str]
    summary: str


@router.post("/summarise-issue", response_model=_SummariseResponse, tags=["ai"])
def summarise_issue(req: _SummariseRequest):
    """Generate AI summary with pain points & suggestions from customer VoCs."""
    tfy_base = os.getenv("TFY_BASE_URL", "")
    tfy_key  = os.getenv("TFY_API_KEY",  "")
    tfy_model = os.getenv("TFY_MODEL", "groq/openai-gpt-oss-120b")

    if not tfy_base or not tfy_key:
        raise HTTPException(status_code=503, detail="LLM not configured.")

    comments_text = "\n".join(f"- {c}" for c in req.comments if c)
    prompt = f"""You are a product analyst focused on reducing customer support contacts. Below are customer voice summaries for the issue category "{req.label}".

Customer Voices:
{comments_text}

Your goal: identify why customers are reaching out and what product changes would eliminate the need to contact support entirely.

Provide a concise analysis in exactly this JSON format (no markdown, no extra text):
{{
  "summary": "2-3 sentence overview of the core problem customers are facing and why they are reaching out to support",
  "pain_points": ["specific pain point 1", "specific pain point 2", "specific pain point 3"],
  "suggestions": ["product improvement 1 that removes need for support contact", "product improvement 2", "product improvement 3"]
}}

Rules:
- pain_points: focus on what is broken, unclear, or missing in the product that forces customers to reach out
- suggestions: focus ONLY on product/UX improvements (better UI, self-serve flows, clearer messaging, automation) — not support process changes
- Each item must be one clear, specific, actionable sentence"""

    try:
        client = _OpenAI(api_key=tfy_key, base_url=tfy_base)
        resp = client.chat.completions.create(
            model=tfy_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
        )
        import json as _json_mod
        raw = (resp.choices[0].message.content or "").strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = _json_mod.loads(raw)
        return _SummariseResponse(
            summary=data.get("summary", ""),
            pain_points=data.get("pain_points", []),
            suggestions=data.get("suggestions", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")


@router.get("/helpdesk/session-timeline-raw/{session_id}", tags=["helpdesk"])
def get_session_timeline_raw(
    session_id: str,
    start_time: Optional[str] = Query(default=None),
    end_time:   Optional[str] = Query(default=None),
):
    """Return raw Loki MCP response for debugging the response format."""
    from ingestion.loki import _mcp_call, _session_date_from_trino
    from datetime import datetime, timedelta
    if not start_time or not end_time:
        start_time, end_time = _session_date_from_trino(session_id)
    if not start_time or not end_time:
        now_ist    = datetime.utcnow() + timedelta(hours=5, minutes=30)
        end_time   = now_ist.strftime("%Y-%m-%dT%H:%M:%S")
        start_time = (now_ist - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        return _mcp_call("AggregateFailureDebug", {"session_id": session_id, "start_time": start_time, "end_time": end_time})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/helpdesk/session-timeline/{session_id}", tags=["helpdesk"])
def get_session_timeline(
    session_id:  str,
    start_time:  Optional[str] = Query(default=None, description="Window start in IST, e.g. 2026-03-17T15:20:00"),
    end_time:    Optional[str] = Query(default=None, description="Window end in IST"),
):
    """
    Fetch structured Loki debug timeline for a session.
    Returns a list of classified events sorted chronologically.
    """
    try:
        return fetch_session_timeline(session_id, start_time, end_time)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Timeline fetch failed: {str(e)}")


class LogQueryRequest(_BaseModel):
    session_id: str
    query: str
    events: List[Dict[str, Any]]   # structured events already fetched on frontend


@router.post("/helpdesk/log-query", tags=["helpdesk"])
def log_query(req: LogQueryRequest):
    """
    Answer a free-text question about a session's Loki log events using Claude.
    """
    tfy_base  = os.getenv("TFY_BASE_URL", "")
    tfy_key   = os.getenv("TFY_API_KEY",  "")
    tfy_model = os.getenv("TFY_MODEL", "groq/openai-gpt-oss-120b")

    if not tfy_key or not tfy_base:
        raise HTTPException(status_code=503, detail="LLM API not configured on server.")

    if not req.events:
        raise HTTPException(status_code=400, detail="No log events provided.")

    # Summarise events into a compact log context for the model
    lines = []
    for e in req.events:
        ts   = e.get("timestamp") or "?"
        ph   = e.get("phase", "")
        typ  = e.get("type", "")
        msg  = e.get("message", "")
        lvl  = e.get("level", "INFO")
        meta_items = ", ".join(f"{k}={v}" for k, v in (e.get("meta") or {}).items())
        line = f"[{ts}] [{ph}/{typ}] [{lvl}] {msg}"
        if meta_items:
            line += f"  | {meta_items}"
        lines.append(line)

    log_context = "\n".join(lines)

    system_prompt = (
        "You are a backend debugging assistant for Paytm's customer support platform. "
        "You are given structured log events from a session and must answer the user's question "
        "about what happened during that session.\n\n"
        "Be concise and specific. Reference timestamps and event types when relevant. "
        "If something is not visible in the logs, say so clearly. "
        "Format your response in plain text — no markdown headers, keep it readable."
    )

    user_message = (
        f"Session ID: {req.session_id}\n\n"
        f"Log events:\n{log_context}\n\n"
        f"Question: {req.query}"
    )

    client = _OpenAI(api_key=tfy_key, base_url=tfy_base)
    resp = client.chat.completions.create(
        model=tfy_model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ],
    )

    answer = resp.choices[0].message.content if resp.choices else "No response generated."
    return {"answer": answer}


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
