"""
Unit tests for the NLP Analysis Layer.
Tests: sentiment analysis, issue clustering, insights generation.

Run:
    cd feedback-platform/backend
    pytest ../tests/test_analysis.py -v
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from datetime import datetime

from models import FeedbackItem, ChannelType, SentimentLabel
from analysis.sentiment  import analyse_sentiment, analyse_batch
from analysis.clustering import categorise_feedback, ISSUE_CATEGORIES
from analysis.insights   import generate_insights
from ingestion.aggregator import aggregate_feedback


# ─── Sentiment Analysis tests ────────────────────────────────────────────────

class TestSentimentAnalysis:
    def test_clearly_negative_text(self):
        result = analyse_sentiment("Payment failed and money was deducted. Terrible app!")
        assert result.label == SentimentLabel.NEGATIVE
        assert result.score < 0

    def test_clearly_positive_text(self):
        result = analyse_sentiment("Love the app! Great service and fast delivery. Amazing!")
        assert result.label == SentimentLabel.POSITIVE
        assert result.score > 0

    def test_neutral_text(self):
        result = analyse_sentiment("The order was placed on Tuesday.")
        assert result.label == SentimentLabel.NEUTRAL

    def test_score_in_valid_range(self):
        for text in [
            "terrible broken crash payment failed",
            "great excellent amazing wonderful",
            "the button exists on the screen",
        ]:
            result = analyse_sentiment(text)
            assert -1.0 <= result.score <= 1.0

    def test_empty_text_is_neutral(self):
        result = analyse_sentiment("")
        assert result.label == SentimentLabel.NEUTRAL
        assert result.score == 0.0

    def test_payment_complaint_is_negative(self):
        result = analyse_sentiment("My payment failed but the money was deducted from my account!")
        assert result.label == SentimentLabel.NEGATIVE

    def test_login_complaint_is_negative(self):
        result = analyse_sentiment("Cannot login, OTP never arrives. Completely useless.")
        assert result.label == SentimentLabel.NEGATIVE

    def test_crash_complaint_is_negative(self):
        result = analyse_sentiment("The app keeps crashing every single time. Broken!")
        assert result.label == SentimentLabel.NEGATIVE

    def test_positive_review_is_positive(self):
        result = analyse_sentiment("Excellent service! Very impressed, smooth and fast delivery.")
        assert result.label == SentimentLabel.POSITIVE

    def test_batch_returns_same_count(self):
        items = aggregate_feedback([ChannelType.HELPDESK])
        results = analyse_batch(items)
        assert len(results) == len(items)

    def test_batch_all_have_labels(self):
        items = aggregate_feedback([ChannelType.HELPDESK])
        results = analyse_batch(items)
        for r in results:
            assert r.label in (SentimentLabel.POSITIVE, SentimentLabel.NEUTRAL, SentimentLabel.NEGATIVE)


# ─── Clustering / Categorisation tests ──────────────────────────────────────

def _make_item(text: str, channel=ChannelType.APP_STORE) -> FeedbackItem:
    return FeedbackItem(
        id="test-id",
        source="test",
        channel=channel,
        timestamp=datetime.utcnow(),
        customer_text=text,
    )


class TestClustering:
    def test_payment_text_labelled_payment(self):
        item = _make_item("My payment failed and money was deducted from my account.")
        result = categorise_feedback([item])
        assert result[0].issue_label == "Payment & Billing Issues"

    def test_otp_text_labelled_login(self):
        item = _make_item("OTP not received, cannot login to my account.")
        result = categorise_feedback([item])
        assert result[0].issue_label == "Login & Authentication Issues"

    def test_crash_text_labelled_performance(self):
        item = _make_item("The app keeps crashing after the latest update.")
        result = categorise_feedback([item])
        assert result[0].issue_label == "App Performance & Crashes"

    def test_support_text_labelled_support(self):
        item = _make_item("Customer support is not responding. Waited 45 minutes on hold.")
        result = categorise_feedback([item])
        assert result[0].issue_label == "Customer Support Issues"

    def test_delivery_text_labelled_delivery(self):
        item = _make_item("My delivery is delayed by 10 days. Package not received.")
        result = categorise_feedback([item])
        assert result[0].issue_label == "Delivery & Shipping Issues"

    def test_returns_categorised_feedback_objects(self):
        items = aggregate_feedback([ChannelType.HELPDESK])
        results = categorise_feedback(items)
        assert len(results) == len(items)
        for r in results:
            assert r.issue_label
            assert r.sentiment
            assert 0.0 <= r.confidence <= 1.0

    def test_all_items_have_sentiment(self):
        items = aggregate_feedback([ChannelType.APP_STORE])
        results = categorise_feedback(items)
        for r in results:
            assert r.sentiment.label in SentimentLabel.__members__.values()

    def test_categories_defined(self):
        assert len(ISSUE_CATEGORIES) >= 5
        for label, cfg in ISSUE_CATEGORIES.items():
            assert isinstance(cfg["keywords"], list)
            assert len(cfg["keywords"]) > 0


# ─── Insights Generation tests ───────────────────────────────────────────────

class TestInsightsGeneration:
    def _get_insights(self, *channel_types):
        items = aggregate_feedback(list(channel_types))
        categorised = categorise_feedback(items)
        return generate_insights(categorised, [c.value for c in channel_types])

    def test_returns_insights_response(self):
        from models import InsightsResponse
        ins = self._get_insights(ChannelType.HELPDESK)
        assert isinstance(ins, InsightsResponse)

    def test_total_feedback_correct(self):
        from ingestion.aggregator import aggregate_feedback as af
        items = af([ChannelType.HELPDESK])
        from analysis.clustering import categorise_feedback as cf
        cat = cf(items)
        ins = generate_insights(cat, ["helpdesk"])
        assert ins.total_feedback == len(items)

    def test_top_issues_not_empty(self):
        ins = self._get_insights(ChannelType.HELPDESK)
        assert len(ins.top_issues) > 0

    def test_top_issues_sorted_by_count(self):
        ins = self._get_insights(ChannelType.APP_STORE)
        counts = [i.count for i in ins.top_issues]
        assert counts == sorted(counts, reverse=True)

    def test_percentages_sum_to_100(self):
        ins = self._get_insights(ChannelType.APP_STORE)
        total_pct = sum(i.percentage for i in ins.top_issues)
        assert abs(total_pct - 100.0) < 1.0  # allow rounding tolerance

    def test_sentiment_distribution_sums_to_total(self):
        ins = self._get_insights(ChannelType.HELPDESK)
        s = ins.sentiment_distribution
        assert s.positive + s.neutral + s.negative == s.total

    def test_each_issue_has_example_comments(self):
        ins = self._get_insights(ChannelType.APP_STORE)
        for issue in ins.top_issues:
            assert isinstance(issue.example_comments, list)

    def test_multi_channel_has_more_feedback(self):
        single = self._get_insights(ChannelType.HELPDESK)
        multi  = self._get_insights(ChannelType.HELPDESK, ChannelType.EMAIL)
        assert multi.total_feedback > single.total_feedback

    def test_ai_summary_is_string(self):
        ins = self._get_insights(ChannelType.HELPDESK)
        assert isinstance(ins.ai_summary, str)
        assert len(ins.ai_summary) > 10

    def test_generated_at_is_recent(self):
        from datetime import timezone, timedelta
        ins = self._get_insights(ChannelType.HELPDESK)
        now = datetime.utcnow()
        diff = (now - ins.generated_at.replace(tzinfo=None)).total_seconds()
        assert diff < 60  # generated within the last 60 seconds

    def test_empty_input_returns_zero_total(self):
        ins = generate_insights([], ["none"])
        assert ins.total_feedback == 0
        assert ins.top_issues == []
