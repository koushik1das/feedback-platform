"""
Unit tests for the Data Ingestion Layer.
Tests: source fetchers, aggregator, schema validation, deduplication.

Run:
    cd feedback-platform/backend
    pytest ../tests/test_ingestion.py -v
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from datetime import datetime

from models import FeedbackItem, ChannelType
from ingestion.sources import (
    fetch_app_store_ios,
    fetch_google_play,
    fetch_twitter,
    fetch_facebook,
    fetch_helpdesk,
    fetch_email,
    fetch_chatbot_logs,
    CHANNEL_FETCHERS,
)
from ingestion.aggregator import aggregate_feedback, get_channel_sample_counts


# ─── Source fetcher tests ────────────────────────────────────────────────────

class TestAppStoreSource:
    def test_returns_list(self):
        items = fetch_app_store_ios()
        assert isinstance(items, list)

    def test_non_empty(self):
        items = fetch_app_store_ios()
        assert len(items) > 0

    def test_items_are_feedback_items(self):
        items = fetch_app_store_ios()
        for item in items:
            assert isinstance(item, FeedbackItem)

    def test_channel_is_app_store(self):
        items = fetch_app_store_ios()
        for item in items:
            assert item.channel == ChannelType.APP_STORE

    def test_source_is_ios(self):
        items = fetch_app_store_ios()
        for item in items:
            assert item.source == "app_store_ios"

    def test_all_have_text(self):
        items = fetch_app_store_ios()
        for item in items:
            assert item.customer_text.strip() != ""

    def test_ratings_in_valid_range(self):
        items = fetch_app_store_ios()
        for item in items:
            if item.rating is not None:
                assert 1 <= item.rating <= 5

    def test_timestamps_are_datetime(self):
        items = fetch_app_store_ios()
        for item in items:
            assert isinstance(item.timestamp, datetime)

    def test_unique_ids(self):
        items = fetch_app_store_ios()
        ids = [i.id for i in items]
        assert len(ids) == len(set(ids)), "IDs must be unique"


class TestGooglePlaySource:
    def test_returns_non_empty_list(self):
        items = fetch_google_play()
        assert len(items) > 0

    def test_channel_is_app_store(self):
        items = fetch_google_play()
        for item in items:
            assert item.channel == ChannelType.APP_STORE


class TestSocialMediaSources:
    def test_twitter_channel(self):
        items = fetch_twitter()
        assert all(i.channel == ChannelType.SOCIAL_MEDIA for i in items)

    def test_facebook_channel(self):
        items = fetch_facebook()
        assert all(i.channel == ChannelType.SOCIAL_MEDIA for i in items)

    def test_twitter_no_rating(self):
        # Social posts don't have star ratings
        items = fetch_twitter()
        assert all(i.rating is None for i in items)


class TestHelpdeskSource:
    def test_returns_items(self):
        items = fetch_helpdesk()
        assert len(items) > 0

    def test_channel_is_helpdesk(self):
        items = fetch_helpdesk()
        for item in items:
            assert item.channel == ChannelType.HELPDESK

    def test_has_ticket_id_in_metadata(self):
        items = fetch_helpdesk()
        for item in items:
            assert "ticket_id" in item.metadata

    def test_has_priority_in_metadata(self):
        items = fetch_helpdesk()
        for item in items:
            assert "priority" in item.metadata
            assert item.metadata["priority"] in ("low", "medium", "high", "critical")


class TestEmailSource:
    def test_returns_items(self):
        items = fetch_email()
        assert len(items) > 0

    def test_channel_is_email(self):
        items = fetch_email()
        for item in items:
            assert item.channel == ChannelType.EMAIL


class TestChatbotSource:
    def test_returns_items(self):
        items = fetch_chatbot_logs()
        assert len(items) > 0

    def test_channel_is_chatbot(self):
        items = fetch_chatbot_logs()
        for item in items:
            assert item.channel == ChannelType.CHATBOT


# ─── Aggregator tests ────────────────────────────────────────────────────────

class TestAggregator:
    def test_single_channel_aggregation(self):
        items = aggregate_feedback([ChannelType.HELPDESK])
        assert len(items) > 0

    def test_multi_channel_aggregation(self):
        single_app   = aggregate_feedback([ChannelType.APP_STORE])
        single_social = aggregate_feedback([ChannelType.SOCIAL_MEDIA])
        combined     = aggregate_feedback([ChannelType.APP_STORE, ChannelType.SOCIAL_MEDIA])
        assert len(combined) == len(single_app) + len(single_social)

    def test_all_channels_aggregation(self):
        items = aggregate_feedback(list(ChannelType))
        assert len(items) > 0

    def test_sorted_newest_first(self):
        items = aggregate_feedback([ChannelType.APP_STORE])
        for i in range(len(items) - 1):
            assert items[i].timestamp >= items[i + 1].timestamp

    def test_no_duplicate_ids(self):
        items = aggregate_feedback(list(ChannelType))
        ids = [i.id for i in items]
        assert len(ids) == len(set(ids))

    def test_raises_on_empty_channels(self):
        with pytest.raises(ValueError):
            aggregate_feedback([])

    def test_channel_sample_counts_returns_dict(self):
        counts = get_channel_sample_counts()
        assert isinstance(counts, dict)
        for channel_type in ChannelType:
            assert channel_type in counts
            assert counts[channel_type] >= 0

    def test_all_items_have_required_fields(self):
        items = aggregate_feedback([ChannelType.HELPDESK])
        for item in items:
            assert item.id
            assert item.source
            assert item.channel
            assert item.customer_text
            assert item.timestamp
