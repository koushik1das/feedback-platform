"""
Topic Clustering Module.

Assigns each piece of feedback to a named issue category using a two-stage
approach:

  Stage 1 – Keyword matching (fast, transparent, deterministic).
             Each category has a list of trigger keywords. The category
             with the most keyword hits wins.

  Stage 2 – TF-IDF similarity fallback (sklearn).
             If no keyword fires, use cosine similarity against category
             seed phrases to pick the best match.

This hybrid approach produces labelled clusters without needing a GPU,
an internet connection, or an LLM API key.
"""

import re
from typing import List, Tuple, Dict
from collections import defaultdict
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import FeedbackItem, CategorisedFeedback
from analysis.sentiment import analyse_sentiment


# ── Category definitions ──────────────────────────────────────────────────────

ISSUE_CATEGORIES: Dict[str, Dict] = {
    "Payment & Billing Issues": {
        "keywords": [
            "payment", "pay", "paid", "charge", "charged", "deduct", "deducted",
            "refund", "money", "bill", "billing", "transaction", "transfer",
            "upi", "net banking", "credit card", "debit card", "gateway",
            "checkout", "order failed", "double charge", "duplicate",
            "amount", "rs.", "rupee", "invoice", "overcharged",
        ],
        "seeds": [
            "payment failed money deducted from account",
            "charged twice double charge refund billing",
            "upi payment gateway error transaction failed",
        ],
        "weight": 1.0,
    },
    "Login & Authentication Issues": {
        "keywords": [
            "login", "log in", "otp", "one time password", "password",
            "forgot password", "reset password", "sign in", "signin",
            "authentication", "verify", "verification", "2fa", "locked out",
            "account access", "cannot access", "session", "logged out",
        ],
        "seeds": [
            "otp not received cannot login password reset",
            "login failing authentication session expired",
        ],
        "weight": 1.0,
    },
    "App Performance & Crashes": {
        "keywords": [
            "crash", "crashes", "crashing", "crashed", "freeze", "freezes",
            "hang", "hangs", "slow", "loading", "lag", "laggy", "unresponsive",
            "not responding", "stuck", "black screen", "white screen",
            "update broke", "broken app", "app not working", "not loading",
            "splash screen", "force close", "keeps crashing",
        ],
        "seeds": [
            "app crash freeze hang slow loading not working",
            "app crashed after update not opening",
        ],
        "weight": 1.0,
    },
    "Customer Support Issues": {
        "keywords": [
            "support", "agent", "helpline", "customer service", "representative",
            "on hold", "no response", "no reply", "ignored", "ticket",
            "escalate", "escalated", "resolve", "unresolved", "wait",
            "waiting", "queue", "chatbot", "bot", "automated", "useless",
            "pathetic support", "poor service", "rude", "unhelpful",
        ],
        "seeds": [
            "customer support not responding helpline on hold",
            "support agent rude unhelpful ticket not resolved",
        ],
        "weight": 1.0,
    },
    "Delivery & Shipping Issues": {
        "keywords": [
            "delivery", "deliver", "delivered", "shipping", "shipment",
            "package", "parcel", "courier", "dispatch", "tracking",
            "delayed", "delay", "late", "not received", "missing",
            "wrong address", "wrong item", "damaged", "lost package",
            "return", "exchange", "pickup", "hub",
        ],
        "seeds": [
            "delivery delayed package not received wrong item",
            "shipment tracking order not delivered courier",
        ],
        "weight": 1.0,
    },
    "Account Management Issues": {
        "keywords": [
            "account", "suspended", "blocked", "banned", "deactivated",
            "profile", "account locked", "account disabled", "restricted",
            "account issue", "access denied", "account blocked",
            "premium", "subscription", "membership",
        ],
        "seeds": [
            "account suspended blocked banned without reason",
            "account access denied locked premium subscription",
        ],
        "weight": 0.9,
    },
    "UI/UX & App Features": {
        "keywords": [
            "ui", "ux", "interface", "design", "navigation", "confusing",
            "layout", "button", "screen", "icon", "hard to find",
            "search", "filter", "cart", "wishlist", "coupon", "promo code",
            "notification", "feature", "wish", "request", "improve",
        ],
        "seeds": [
            "ui confusing navigation search filter not working",
            "feature request wishlist coupon code improvement",
        ],
        "weight": 0.8,
    },
}

UNKNOWN_LABEL = "General Feedback"


# ── TF-IDF fallback ───────────────────────────────────────────────────────────

def _build_tfidf_index():
    """Build a lightweight inverted TF-IDF index over category seed phrases."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        labels = list(ISSUE_CATEGORIES.keys())
        seed_docs = [" ".join(v["seeds"]) for v in ISSUE_CATEGORIES.values()]

        vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        seed_matrix = vectorizer.fit_transform(seed_docs)

        return vectorizer, seed_matrix, labels
    except ImportError:
        return None, None, None


_vectorizer, _seed_matrix, _category_labels = _build_tfidf_index()


def _tfidf_classify(text: str) -> Tuple[str, float]:
    """Use TF-IDF cosine similarity to find the closest issue category."""
    if _vectorizer is None:
        return UNKNOWN_LABEL, 0.0

    try:
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        vec = _vectorizer.transform([text.lower()])
        sims = cosine_similarity(vec, _seed_matrix).flatten()
        best_idx = int(np.argmax(sims))
        best_score = float(sims[best_idx])
        return (_category_labels[best_idx], best_score) if best_score > 0.05 \
               else (UNKNOWN_LABEL, 0.0)
    except Exception:
        return UNKNOWN_LABEL, 0.0


# ── Primary keyword classifier ────────────────────────────────────────────────

def _keyword_classify(text: str) -> Tuple[str, float]:
    """
    Score each category by counting keyword hits in the text.
    Returns (best_label, normalised_confidence 0-1).
    """
    text_lower = text.lower()
    scores: Dict[str, float] = defaultdict(float)

    for label, cfg in ISSUE_CATEGORIES.items():
        for kw in cfg["keywords"]:
            # Whole-word match for single words, substring for phrases
            if " " in kw:
                if kw in text_lower:
                    scores[label] += cfg["weight"]
            else:
                pattern = r"\b" + re.escape(kw) + r"\b"
                hits = len(re.findall(pattern, text_lower))
                scores[label] += hits * cfg["weight"]

    if not scores or max(scores.values()) == 0:
        return UNKNOWN_LABEL, 0.0

    best_label = max(scores, key=scores.__getitem__)
    total = sum(scores.values())
    confidence = scores[best_label] / total if total > 0 else 0.0
    return best_label, round(confidence, 4)


# ── Public API ────────────────────────────────────────────────────────────────

def categorise_feedback(items: List[FeedbackItem]) -> List[CategorisedFeedback]:
    """
    Classify and enrich a list of FeedbackItems.

    Strategy:
      1. Run keyword classifier.
      2. If no keywords matched, fall back to TF-IDF.
      3. Attach sentiment result.
    """
    results: List[CategorisedFeedback] = []

    for item in items:
        label, conf = _keyword_classify(item.customer_text)

        if label == UNKNOWN_LABEL:
            label, conf = _tfidf_classify(item.customer_text)

        sentiment = analyse_sentiment(item.customer_text)
        results.append(CategorisedFeedback(
            feedback=item,
            sentiment=sentiment,
            issue_label=label,
            confidence=conf,
        ))

    return results
