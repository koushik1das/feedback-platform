"""
Trino-based analytics for the Helpdesk channel.

Queries hive.crm_cst.feedback_complete_analyzed_data_snapshot_v3
and returns structured insights compatible with InsightsResponse.
"""

import os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Any, Dict, List

from dotenv import load_dotenv
from trino.dbapi import connect
from trino.auth import BasicAuthentication

# Load .env from repo root (two levels up from this file)
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# ── Config ────────────────────────────────────────────────────────────────────

TRINO_HOST         = os.getenv("TRINO_HOST",         "cdp-trino-query.platform.mypaytm.com")
TRINO_PORT         = int(os.getenv("TRINO_PORT",     "443"))
TRINO_USER         = os.getenv("TRINO_USER",         "")
TRINO_SERVICE_USER = os.getenv("TRINO_SERVICE_USER", "")
TRINO_SERVICE_PASS = os.getenv("TRINO_SERVICE_PASSWORD", "")

TABLE = "hive.crm_cst.feedback_complete_analyzed_data_snapshot_v3"

# Map product slugs → CST entities in Trino
CST_ENTITY_MAP: Dict[str, str] = {
    "loan":                  "p4bbusinessloan",
    "payments_settlement":   "p4bpayoutandsettlement",
}

# Merchant tone → numeric sentiment score
TONE_SCORE: Dict[str, float] = {
    "frustrated": -0.7,
    "angry":      -0.8,
    "confused":   -0.3,
    "neutral":     0.0,
    "inquisitive": 0.3,
    "happy":       0.8,
    "satisfied":   0.8,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _score_to_label(score: float) -> str:
    if score >= 0.2:
        return "positive"
    if score <= -0.2:
        return "negative"
    return "neutral"


def _connect():
    return connect(
        host=TRINO_HOST,
        port=TRINO_PORT,
        user=TRINO_USER,
        auth=BasicAuthentication(TRINO_SERVICE_USER, TRINO_SERVICE_PASS),
        catalog="hive",
        http_scheme="https",
    )


# ── Main query ────────────────────────────────────────────────────────────────

def fetch_helpdesk_insights(product: str, days: int = 30) -> Dict[str, Any]:
    """
    Query Trino and return a dict that maps directly to InsightsResponse fields.

    Args:
        product: one of "loan", "payments_settlement"
        days:    lookback window in days anchored to latest available data (default 30)
    """
    cst_entity = CST_ENTITY_MAP.get(product, product)
    conn = _connect()
    cur = conn.cursor()

    # Anchor to the latest available date in the table (not today)
    cur.execute(f"""
        SELECT MAX(dl_last_updated)
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND dl_last_updated >= DATE '2025-01-01'
    """)
    max_date = cur.fetchone()[0]
    if max_date is None:
        raise ValueError(f"No data found for entity '{cst_entity}'. The CST entity may be incorrect or have no records.")
    since = (max_date - timedelta(days=days)).strftime("%Y-%m-%d")

    # 1. Issues with tone breakdown (for avg sentiment per issue)
    cur.execute(f"""
        SELECT out_key_problem_desc, out_merchant_tone, COUNT(*) AS cnt
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND dl_last_updated >= DATE '{since}'
          AND out_key_problem_desc IS NOT NULL
          AND out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
        GROUP BY out_key_problem_desc, out_merchant_tone
    """)
    issue_tone_rows = cur.fetchall()

    # 2. Total completed records
    cur.execute(f"""
        SELECT COUNT(*)
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND dl_last_updated >= DATE '{since}'
    """)
    total = cur.fetchone()[0] or 0

    # 3. Overall tone distribution for sentiment summary
    cur.execute(f"""
        SELECT out_merchant_tone, COUNT(*) AS cnt
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND dl_last_updated >= DATE '{since}'
        GROUP BY out_merchant_tone
    """)
    tone_rows = cur.fetchall()

    # 3b. Social media escalation threat
    cur.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN social_media_threat IN ('YES', 'हाँ', 'हां') THEN 1 ELSE 0 END) AS threat_count
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND dl_last_updated >= DATE '{since}'
    """)
    threat_row = cur.fetchone()
    threat_total = threat_row[0] or 0
    threat_count = threat_row[1] or 0
    threat_pct = round(threat_count / threat_total * 100, 2) if threat_total > 0 else 0.0

    # 4. Sample comments per issue (fetch a pool, group in Python)
    cur.execute(f"""
        SELECT out_key_problem_desc, out_key_problem_sub_desc
        FROM {TABLE}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND dl_last_updated >= DATE '{since}'
          AND out_key_problem_desc IS NOT NULL
          AND out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
          AND out_key_problem_sub_desc IS NOT NULL
          AND out_key_problem_sub_desc NOT IN ('Others', 'NA', 'None', '')
        LIMIT 500
    """)
    comment_rows = cur.fetchall()

    # ── Aggregate issue data ──────────────────────────────────────────────────

    l1_data: Dict[str, Dict] = defaultdict(
        lambda: {"total": 0, "tone_counts": defaultdict(int)}
    )
    for l1, tone, cnt in issue_tone_rows:
        l1_data[l1]["total"] += cnt
        l1_data[l1]["tone_counts"][tone or "neutral"] += cnt

    # Pool sample comments per L1 (up to 3 each)
    comments_by_l1: Dict[str, List[str]] = defaultdict(list)
    for l1, comment in comment_rows:
        if l1 and comment and len(comments_by_l1[l1]) < 3:
            comments_by_l1[l1].append(comment)

    sorted_l1 = sorted(l1_data.items(), key=lambda x: x[1]["total"], reverse=True)

    top_issues = []
    for l1, data in sorted_l1[:10]:
        l1_total = data["total"]
        tone_counts = data["tone_counts"]
        weighted_sum = sum(TONE_SCORE.get(t, 0.0) * c for t, c in tone_counts.items())
        avg_score = weighted_sum / l1_total if l1_total else 0.0
        top_issues.append({
            "label":            l1,
            "count":            l1_total,
            "percentage":       round(l1_total / total * 100, 1) if total else 0.0,
            "avg_sentiment":    round(avg_score, 2),
            "sentiment_label":  _score_to_label(avg_score),
            "example_comments": comments_by_l1.get(l1, []),
            "channels":         {"helpdesk": l1_total},
        })

    # ── Sentiment distribution ────────────────────────────────────────────────

    positive = neutral = negative = 0
    for tone, cnt in tone_rows:
        score = TONE_SCORE.get(tone or "neutral", 0.0)
        if score >= 0.2:
            positive += cnt
        elif score <= -0.2:
            negative += cnt
        else:
            neutral += cnt

    # ── AI summary (rule-based) ───────────────────────────────────────────────

    top_label = top_issues[0]["label"] if top_issues else "N/A"
    top_pct   = top_issues[0]["percentage"] if top_issues else 0
    neg_pct   = round(negative / total * 100, 1) if total else 0
    ai_summary = (
        f"Analysed {total:,} helpdesk interactions for {cst_entity} "
        f"({since} → {max_date}). "
        f"Top complaint: '{top_label}' ({top_pct}% of tickets). "
        f"{neg_pct}% of merchants expressed frustration. "
        f"Top trending issues: {', '.join(i['label'] for i in top_issues[:3])}."
    )

    return {
        "total_feedback":           total,
        "channels_analysed":        ["Helpdesk"],
        "top_issues":               top_issues,
        "social_media_threat_count": threat_count,
        "social_media_threat_pct":   threat_pct,
        "sentiment_distribution": {
            "positive": positive,
            "neutral":  neutral,
            "negative": negative,
            "total":    total,
        },
        "trending_issues": [i["label"] for i in top_issues[:3]],
        "ai_summary":      ai_summary,
        "generated_at":    datetime.utcnow().isoformat(),
    }
