"""
Feedback Aggregation Service.

Fetches feedback from one or more channels and returns a combined,
deduplicated list of FeedbackItem objects sorted by timestamp (newest first).
"""

from typing import List
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import FeedbackItem, ChannelType
from ingestion.sources import CHANNEL_FETCHERS


def aggregate_feedback(channels: List[ChannelType]) -> List[FeedbackItem]:
    """
    Fetch and aggregate feedback from the specified channels.

    Args:
        channels: List of ChannelType enums to pull data from.

    Returns:
        Sorted list of FeedbackItem (newest first), deduplicated by ID.
    """
    if not channels:
        raise ValueError("At least one channel must be specified.")

    seen_ids: set[str] = set()
    combined: List[FeedbackItem] = []

    for channel in channels:
        if channel not in CHANNEL_FETCHERS:
            raise ValueError(f"Unsupported channel: {channel}")

        items = CHANNEL_FETCHERS[channel]()
        for item in items:
            if item.id not in seen_ids:
                seen_ids.add(item.id)
                combined.append(item)

    # Newest feedback first
    combined.sort(key=lambda x: x.timestamp, reverse=True)
    return combined


def get_channel_sample_counts() -> dict[str, int]:
    """
    Return the approximate number of feedback items available per channel.
    Used by the frontend to display counts on channel cards.
    """
    return {
        ChannelType.APP_STORE:    len(CHANNEL_FETCHERS[ChannelType.APP_STORE]()),
        ChannelType.SOCIAL_MEDIA: len(CHANNEL_FETCHERS[ChannelType.SOCIAL_MEDIA]()),
        ChannelType.HELPDESK:     len(CHANNEL_FETCHERS[ChannelType.HELPDESK]()),
        ChannelType.EMAIL:        len(CHANNEL_FETCHERS[ChannelType.EMAIL]()),
        ChannelType.CHATBOT:      len(CHANNEL_FETCHERS[ChannelType.CHATBOT]()),
    }
