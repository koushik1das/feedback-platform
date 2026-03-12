"""
Integration tests for the FastAPI API layer.
Uses TestClient (no running server required).

Run:
    cd feedback-platform/backend
    pytest ../tests/test_api.py -v
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


# ─── Health check ────────────────────────────────────────────────────────────

class TestHealth:
    def test_root_returns_200(self):
        r = client.get("/")
        assert r.status_code == 200

    def test_root_has_service_key(self):
        r = client.get("/")
        assert "service" in r.json()

    def test_api_health_returns_ok(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ─── Channels endpoint ───────────────────────────────────────────────────────

class TestChannelsEndpoint:
    def test_returns_200(self):
        r = client.get("/api/channels")
        assert r.status_code == 200

    def test_returns_list(self):
        r = client.get("/api/channels")
        assert isinstance(r.json(), list)

    def test_returns_five_channels(self):
        r = client.get("/api/channels")
        assert len(r.json()) == 5

    def test_each_channel_has_required_fields(self):
        r = client.get("/api/channels")
        for ch in r.json():
            assert "id"           in ch
            assert "name"         in ch
            assert "description"  in ch
            assert "sample_count" in ch

    def test_channel_ids_are_valid(self):
        valid = {"app_store", "social_media", "helpdesk", "email", "chatbot"}
        r = client.get("/api/channels")
        ids = {ch["id"] for ch in r.json()}
        assert ids == valid

    def test_sample_counts_positive(self):
        r = client.get("/api/channels")
        for ch in r.json():
            assert ch["sample_count"] > 0


# ─── Analyse endpoint ────────────────────────────────────────────────────────

class TestAnalyseEndpoint:
    def _post(self, channels):
        return client.post("/api/analyse", json={"channels": channels})

    def test_single_channel_returns_200(self):
        r = self._post(["helpdesk"])
        assert r.status_code == 200

    def test_multiple_channels_returns_200(self):
        r = self._post(["app_store", "social_media"])
        assert r.status_code == 200

    def test_all_channels_returns_200(self):
        r = self._post(["app_store", "social_media", "helpdesk", "email", "chatbot"])
        assert r.status_code == 200

    def test_response_has_required_keys(self):
        r = self._post(["helpdesk"])
        data = r.json()
        required = {
            "total_feedback", "channels_analysed", "top_issues",
            "sentiment_distribution", "trending_issues", "ai_summary",
            "generated_at",
        }
        for key in required:
            assert key in data, f"Missing key: {key}"

    def test_total_feedback_positive(self):
        r = self._post(["helpdesk"])
        assert r.json()["total_feedback"] > 0

    def test_top_issues_is_list(self):
        r = self._post(["helpdesk"])
        assert isinstance(r.json()["top_issues"], list)

    def test_top_issues_have_required_fields(self):
        r = self._post(["app_store"])
        for issue in r.json()["top_issues"]:
            assert "label"            in issue
            assert "count"            in issue
            assert "percentage"       in issue
            assert "example_comments" in issue
            assert "sentiment_label"  in issue
            assert "channels"         in issue

    def test_percentages_sum_close_to_100(self):
        r = self._post(["app_store"])
        total = sum(i["percentage"] for i in r.json()["top_issues"])
        assert abs(total - 100.0) < 1.0

    def test_sentiment_distribution_sums(self):
        r = self._post(["helpdesk"])
        s = r.json()["sentiment_distribution"]
        assert s["positive"] + s["neutral"] + s["negative"] == s["total"]

    def test_channels_analysed_matches_request(self):
        r = self._post(["helpdesk", "email"])
        assert set(r.json()["channels_analysed"]) == {"helpdesk", "email"}

    def test_ai_summary_not_empty(self):
        r = self._post(["helpdesk"])
        assert len(r.json()["ai_summary"]) > 10

    def test_empty_channels_returns_400(self):
        r = self._post([])
        assert r.status_code == 400

    def test_invalid_channel_returns_422(self):
        r = self._post(["invalid_channel_xyz"])
        assert r.status_code == 422


# ─── Feedback endpoint ───────────────────────────────────────────────────────

class TestFeedbackEndpoint:
    def test_returns_200(self):
        r = client.get("/api/feedback")
        assert r.status_code == 200

    def test_returns_list(self):
        r = client.get("/api/feedback")
        assert isinstance(r.json(), list)

    def test_default_limit_respected(self):
        r = client.get("/api/feedback?limit=10")
        assert len(r.json()) <= 10

    def test_each_item_has_required_fields(self):
        r = client.get("/api/feedback?limit=5")
        for item in r.json():
            assert "id"            in item
            assert "source"        in item
            assert "channel"       in item
            assert "timestamp"     in item
            assert "customer_text" in item

    def test_channel_filter_works(self):
        r = client.get("/api/feedback?channels=helpdesk&limit=50")
        assert r.status_code == 200
        for item in r.json():
            assert item["channel"] == "helpdesk"

    def test_offset_pagination(self):
        r1 = client.get("/api/feedback?limit=5&offset=0")
        r2 = client.get("/api/feedback?limit=5&offset=5")
        ids1 = {i["id"] for i in r1.json()}
        ids2 = {i["id"] for i in r2.json()}
        assert ids1.isdisjoint(ids2), "Offset pages must not overlap"
