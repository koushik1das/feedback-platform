"""
Deployment-readiness tests.

Validates that:
  - CORS is configurable via CORS_ORIGINS env var
  - Health endpoint works
  - Auth config reads from env vars (no hardcoded localhost in runtime)
  - Frontend config.js exists and exports API_BASE

Run:
    cd feedback-platform/backend
    pytest ../tests/test_deployment.py -v
"""

import sys, os, importlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from fastapi.testclient import TestClient


# ─── CORS configuration tests ───────────────────────────────────────────────

class TestCORSConfig:
    """Verify CORS origins are driven by CORS_ORIGINS env var."""

    def _reload_app(self):
        """Re-import main module so it picks up fresh env vars."""
        import api.main as main_mod
        importlib.reload(main_mod)
        return main_mod.app

    def test_default_cors_allows_all(self):
        os.environ.pop("CORS_ORIGINS", None)
        app = self._reload_app()
        # The CORSMiddleware should be present
        mw_classes = [type(m).__name__ for m in getattr(app, "user_middleware", [])]
        # FastAPI stores middleware specs; just verify app starts
        client = TestClient(app)
        r = client.get("/")
        assert r.status_code == 200

    def test_custom_cors_origins(self):
        os.environ["CORS_ORIGINS"] = "http://example.com:3011,http://other.com"
        app = self._reload_app()
        client = TestClient(app)
        r = client.get("/", headers={"Origin": "http://example.com:3011"})
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "http://example.com:3011"
        os.environ.pop("CORS_ORIGINS", None)


# ─── Health endpoint ────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_root_returns_running(self):
        from api.main import app
        client = TestClient(app)
        r = client.get("/")
        data = r.json()
        assert data["status"] == "running"
        assert data["version"] == "1.0.0"


# ─── Auth env-var configuration ─────────────────────────────────────────────

class TestAuthConfig:
    """Verify auth module reads from env, not hardcoded values."""

    def test_google_redirect_uri_from_env(self):
        os.environ["GOOGLE_REDIRECT_URI"] = "http://prod.example.com:3011/auth/callback"
        import api.auth as auth_mod
        importlib.reload(auth_mod)
        assert auth_mod.GOOGLE_REDIRECT_URI == "http://prod.example.com:3011/auth/callback"
        os.environ.pop("GOOGLE_REDIRECT_URI", None)

    def test_frontend_url_from_env(self):
        os.environ["FRONTEND_URL"] = "http://prod.example.com:3011"
        import api.auth as auth_mod
        importlib.reload(auth_mod)
        assert auth_mod.FRONTEND_URL == "http://prod.example.com:3011"
        os.environ.pop("FRONTEND_URL", None)


# ─── Frontend config file exists ────────────────────────────────────────────

class TestFrontendConfig:
    def test_config_js_exists(self):
        config_path = os.path.join(
            os.path.dirname(__file__), "..", "frontend", "src", "config.js"
        )
        assert os.path.isfile(config_path), "frontend/src/config.js must exist"

    def test_config_js_exports_api_base(self):
        config_path = os.path.join(
            os.path.dirname(__file__), "..", "frontend", "src", "config.js"
        )
        content = open(config_path).read()
        assert "export const API_BASE" in content
        assert "REACT_APP_API_BASE" in content

    def test_no_hardcoded_localhost_8000_in_frontend(self):
        """Ensure no component still has a hardcoded localhost:8000 fallback."""
        src_dir = os.path.join(
            os.path.dirname(__file__), "..", "frontend", "src"
        )
        for root, _, files in os.walk(src_dir):
            for f in files:
                if not f.endswith(".js"):
                    continue
                path = os.path.join(root, f)
                content = open(path).read()
                if f == "config.js":
                    continue  # config.js is the single source of truth
                assert "localhost:8000" not in content, (
                    f"{path} still contains hardcoded localhost:8000"
                )
