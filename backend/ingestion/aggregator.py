"""
Feedback Aggregation Service.
"""

from typing import List
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import FeedbackItem, ChannelType
from ingestion.sources import aggregate_feedback as _fetch


def aggregate_feedback(channels: List[ChannelType]) -> List[FeedbackItem]:
    if not channels:
        raise ValueError("At least one channel must be specified.")
    items = _fetch(channels)
    items.sort(key=lambda x: x.timestamp, reverse=True)
    return items


def get_channel_sample_counts() -> dict:
    return {
        ChannelType.APP_STORE:    0,
        ChannelType.SOCIAL_MEDIA: 0,
        ChannelType.HELPDESK:     0,
        ChannelType.EMAIL:        0,
        ChannelType.CHATBOT:      0,
    }
