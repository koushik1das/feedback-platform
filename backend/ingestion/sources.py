"""
Data sources for all supported feedback channels.
Only real integrations — no mock data.
"""

import logging
from datetime import datetime
from typing import List, Tuple, Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import FeedbackItem, ChannelType

GOOGLE_PLAY_PACKAGE = "net.one97.paytm"

logger = logging.getLogger(__name__)


# ── Google Play Store ─────────────────────────────────────────────────────────

def fetch_google_play(
    count: int = 200,
    continuation_token=None,
    package: str = GOOGLE_PLAY_PACKAGE,
) -> Tuple[List[FeedbackItem], Optional[object]]:
    """
    Fetch live reviews from Google Play Store.
    Returns (List[FeedbackItem], continuation_token).
    Raises RuntimeError if the scrape fails.
    """
    try:
        from google_play_scraper import reviews, Sort
        result, next_token = reviews(
            package,
            lang='en',
            country='in',
            sort=Sort.NEWEST,
            count=count,
            continuation_token=continuation_token,
        )
    except Exception as e:
        raise RuntimeError(
            f"Failed to fetch Google Play reviews for '{package}': {e}"
        ) from e

    items = []
    for r in result:
        if not r.get('content'):
            continue
        items.append(FeedbackItem(
            id=r['reviewId'],
            source='google_play',
            channel=ChannelType.APP_STORE,
            timestamp=r['at'] if isinstance(r['at'], datetime) else datetime.utcnow(),
            customer_text=r['content'],
            rating=float(r['score']),
            metadata={
                'platform':    'Android',
                'author':      r.get('userName', ''),
                'app_version': r.get('appVersion', ''),
                'thumbs_up':   r.get('thumbsUpCount', 0),
                'reply':       r.get('replyContent', ''),
                'package':     package,
            },
        ))

    logger.info("Fetched %d live Google Play reviews for %s", len(items), package)
    return items, next_token


# ── Channel registry ──────────────────────────────────────────────────────────
# Only app_store is wired to a real source here.
# Helpdesk uses trino_helpdesk.py directly via its own route.

def aggregate_feedback(channels) -> List[FeedbackItem]:
    items = []
    for ch in channels:
        if ch == ChannelType.APP_STORE:
            gp_items, _ = fetch_google_play()
            items.extend(gp_items)
        else:
            logger.warning("Channel %s has no real data source configured.", ch)
    return items
