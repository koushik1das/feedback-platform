"""
Pydantic data models for the Customer Feedback Intelligence Platform.
Defines unified schemas used across ingestion, analysis, and API layers.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ChannelType(str, Enum):
    """Enumeration of supported feedback channels."""
    APP_STORE      = "app_store"
    SOCIAL_MEDIA   = "social_media"
    HELPDESK       = "helpdesk"
    EMAIL          = "email"
    CHATBOT        = "chatbot"


class SentimentLabel(str, Enum):
    POSITIVE = "positive"
    NEUTRAL  = "neutral"
    NEGATIVE = "negative"


class FeedbackItem(BaseModel):
    """
    Unified schema for a single piece of customer feedback.
    All sources are normalised into this structure before analysis.
    """
    id:            str
    source:        str                     # e.g. "app_store_ios", "twitter", "zendesk"
    channel:       ChannelType
    timestamp:     datetime
    customer_text: str
    rating:        Optional[float] = None  # 1-5 star rating (where applicable)
    metadata:      Dict[str, Any]  = Field(default_factory=dict)


class SentimentResult(BaseModel):
    label: SentimentLabel
    score: float   # -1.0 (most negative) … +1.0 (most positive)


class CategorisedFeedback(BaseModel):
    """A FeedbackItem enriched with NLP results."""
    feedback:    FeedbackItem
    sentiment:   SentimentResult
    issue_label: str     # e.g. "Payment & Billing Issues"
    confidence:  float   # 0-1


class IssueStats(BaseModel):
    """Aggregated statistics for a single issue cluster."""
    label:              str
    count:              int
    percentage:         float
    avg_sentiment:      float
    sentiment_label:    SentimentLabel
    example_comments:   List[str]
    comment_ticket_ids: Optional[List[Optional[str]]]   = None  # parallel — ticket IDs
    comment_tones:      Optional[List[Optional[str]]]   = None  # parallel — merchant tones
    comment_langs:      Optional[List[Optional[str]]]   = None  # parallel — language codes
    comment_dates:          Optional[List[Optional[str]]]        = None  # parallel — feedback dates
    comment_ratings:        Optional[List[Optional[float]]]      = None  # parallel — star ratings
    comment_function_calls: Optional[List[Optional[List[str]]]]  = None  # parallel — function call names per session
    comment_durations:      Optional[List[Optional[int]]]        = None  # parallel — call duration seconds
    channels:               Dict[str, int]   # breakdown by channel


class TranscriptMessage(BaseModel):
    message_id:  str
    role:        str           # "user", "assistant", "system"
    content:     str
    type:        Optional[str] = None
    hidden:      bool          = False
    cta_options: List[str]     = []
    lang:        Optional[str] = None
    created_at:  str


class SentimentDistribution(BaseModel):
    positive: int
    neutral:  int
    negative: int
    total:    int


class InsightsResponse(BaseModel):
    """Full analytics payload returned by the API."""
    total_feedback:             int
    channels_analysed:          List[str]
    top_issues:                 List[IssueStats]
    sentiment_distribution:     SentimentDistribution
    trending_issues:            List[str]
    ai_summary:                 str
    generated_at:               datetime
    social_media_threat_count:  Optional[int]   = None
    social_media_threat_pct:    Optional[float] = None
    avg_rating:                 Optional[float] = None   # avg star rating (app store only)
    # App Store pagination
    session_id:                 Optional[str]  = None
    total_reviews_loaded:       Optional[int]  = None
    has_more:                   Optional[bool] = None
    # Actual date window used (may differ from requested range if data is stale)
    data_from:                  Optional[str]  = None   # "YYYY-MM-DD"
    data_until:                 Optional[str]  = None   # "YYYY-MM-DD"


# ── Request / Response models for the API ────────────────────────────────────

class AnalyseRequest(BaseModel):
    channels:    List[ChannelType]
    app_package: Optional[str] = None   # Google Play package to scrape


class HelpdeskType(str, Enum):
    MERCHANT = "merchant"
    CUSTOMER = "customer"


class DateRange(str, Enum):
    YESTERDAY            = "yesterday"
    DAY_BEFORE_YESTERDAY = "day_before_yesterday"
    LAST_7_DAYS          = "last_7_days"
    LAST_30_DAYS         = "last_30_days"


class HelpdeskProduct(str, Enum):
    LOAN                = "loan"
    PAYMENTS_SETTLEMENT = "payments_settlement"
    SOUNDBOX            = "soundbox"


class CustomerProduct(str, Enum):
    TRAIN  = "train"
    BUS    = "bus"
    FLIGHT = "flight"


class HelpdeskAnalyseRequest(BaseModel):
    helpdesk_type: HelpdeskType
    product:       str       # HelpdeskProduct for merchant, CustomerProduct for customer
    date_range:    DateRange = DateRange.LAST_7_DAYS


class ChannelInfo(BaseModel):
    id:          ChannelType
    name:        str
    description: str
    icon:        str
    sample_count: int


class EvalItem(BaseModel):
    key:   str
    label: str
    value: float
    note:  Optional[str] = None


class EvalResponse(BaseModel):
    ticket_id:    str
    eval_score:   Optional[float]       = None
    went_right:   List[EvalItem]        = []
    went_wrong:   List[EvalItem]        = []
    raw_metrics:  Dict[str, Any]        = {}


class MasterDataSection(BaseModel):
    key:   str
    title: str
    icon:  str
    data:  Dict[str, Any]


class MasterDataResponse(BaseModel):
    ticket_id:   str
    customer_id: Optional[str] = None
    cst_entity:  Optional[str] = None
    workflow:    Optional[str] = None
    intent:      Optional[str] = None
    created_at:  Optional[str] = None
    sections:    List[MasterDataSection] = []
