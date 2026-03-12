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
    label:           str
    count:           int
    percentage:      float
    avg_sentiment:   float
    sentiment_label: SentimentLabel
    example_comments: List[str]
    channels:        Dict[str, int]   # breakdown by channel


class SentimentDistribution(BaseModel):
    positive: int
    neutral:  int
    negative: int
    total:    int


class InsightsResponse(BaseModel):
    """Full analytics payload returned by the API."""
    total_feedback:          int
    channels_analysed:       List[str]
    top_issues:              List[IssueStats]
    sentiment_distribution:  SentimentDistribution
    trending_issues:         List[str]
    ai_summary:              str
    generated_at:            datetime


# ── Request / Response models for the API ────────────────────────────────────

class AnalyseRequest(BaseModel):
    channels: List[ChannelType]


class ChannelInfo(BaseModel):
    id:          ChannelType
    name:        str
    description: str
    icon:        str
    sample_count: int
