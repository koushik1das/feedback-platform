"""
Google OAuth2 authentication.

Flow:
  1. Browser → GET /api/auth/google        → redirect to Google consent
  2. Google  → GET /api/auth/google/callback?code=… → exchange code, issue JWT
  3. Browser → GET /api/auth/me            → validate JWT, return user info
"""

import os, secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import requests as _requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

auth_router = APIRouter()

# ── Config (override via environment variables) ───────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID",     "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI",  "http://localhost:3000/auth/callback")
FRONTEND_URL         = os.getenv("FRONTEND_URL",          "http://localhost:3000")

JWT_SECRET    = os.getenv("JWT_SECRET", secrets.token_hex(32))   # set a fixed value in .env for prod
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 10   # token valid for 10 hours

ALLOWED_DOMAINS = {"paytm.com", "paytmpayments.com"}

# ── Google endpoints ──────────────────────────────────────────────────────────
_GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO  = "https://www.googleapis.com/oauth2/v3/userinfo"

# ── JWT helpers ───────────────────────────────────────────────────────────────
_security = HTTPBearer(auto_error=False)


def _create_jwt(email: str, name: str, picture: str) -> str:
    payload = {
        "sub":     email,
        "name":    name,
        "picture": picture,
        "exp":     datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """FastAPI dependency — validates Bearer JWT and returns the payload dict."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Routes ────────────────────────────────────────────────────────────────────

@auth_router.get("/auth/google", tags=["auth"])
def google_login():
    """Redirect browser to Google OAuth consent screen."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
        "prompt":        "select_account",
    }
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}")


@auth_router.get("/auth/exchange", tags=["auth"])
def exchange_code(code: str = Query(...)):
    """
    Called by the frontend after Google redirects to localhost:3000?code=…
    Exchanges the authorisation code for a JWT and returns it as JSON.
    """
    # 1. Exchange authorisation code for Google access token
    token_resp = _requests.post(_GOOGLE_TOKEN_URL, data={
        "code":          code,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "grant_type":    "authorization_code",
    }, timeout=10)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="token_exchange_failed")

    access_token = token_resp.json().get("access_token")

    # 2. Fetch user profile
    user_resp = _requests.get(
        _GOOGLE_USERINFO,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if user_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="userinfo_failed")

    user  = user_resp.json()
    email = user.get("email", "")

    # 3. Restrict to allowed domains
    domain = email.lower().split("@")[-1]
    if domain not in ALLOWED_DOMAINS:
        raise HTTPException(status_code=403, detail="unauthorized_domain")

    # 4. Issue and return JWT
    token = _create_jwt(email, user.get("name", ""), user.get("picture", ""))
    return {"token": token, "email": email, "name": user.get("name", ""), "picture": user.get("picture", "")}


@auth_router.get("/auth/me", tags=["auth"])
def get_me(user: dict = Depends(get_current_user)):
    """Return current user info decoded from JWT."""
    return {
        "email":   user["sub"],
        "name":    user.get("name"),
        "picture": user.get("picture"),
    }
