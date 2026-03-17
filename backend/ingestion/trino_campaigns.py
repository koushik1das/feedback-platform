"""
Trino queries for Outbound Campaign analytics.
Table: hive.mhd_crm_cst.cs_call_details_record_snapshot_v3
"""

from datetime import datetime
from typing import Any, Dict, List

from ingestion.trino_helpdesk import _connect, _resolve_date_range

CAMPAIGN_TABLE = "hive.mhd_crm_cst.cs_call_details_record_snapshot_v3"

# Known prefix tokens used to bucket campaigns into groups
_KNOWN_PREFIXES = {"FSM", "FSE", "EDC", "GMV", "IVR", "OBD"}


def _campaign_category(name: str) -> str:
    """
    Derive a display category from a campaign name.
    Checks first two words for known short-code prefixes; falls back to the
    capitalised first word.
    """
    if not name:
        return "Other"
    words = name.split()
    for w in words[:2]:
        if w.upper() in _KNOWN_PREFIXES:
            return w.upper()
    return words[0].capitalize() if words else "Other"


def fetch_campaign_list(date_range: str = "last_7_days") -> List[Dict[str, Any]]:
    """
    Return list of outbound campaigns with summary stats for the given date range.
    """
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT MAX(dl_last_updated)
        FROM {CAMPAIGN_TABLE}
        WHERE dl_last_updated >= DATE '2025-01-01'
          AND call_direction = 'OUTBOUND_TELCO'
    """)
    max_date = cur.fetchone()[0]
    if not max_date:
        return []

    since, until = _resolve_date_range(max_date, date_range)
    date_filter = f"dl_last_updated BETWEEN DATE '{since}' AND DATE '{until}'"

    cur.execute(f"""
        SELECT
            pre_call_intent                                                     AS campaign,
            COUNT(*)                                                            AS total_calls,
            ROUND(AVG(call_duration_seconds), 0)                               AS avg_duration,
            SUM(CASE WHEN disconnection_source = 'far_end'  THEN 1 ELSE 0 END) AS customer_hangups,
            SUM(CASE WHEN disconnection_source = 'near_end' THEN 1 ELSE 0 END) AS bot_hangups
        FROM {CAMPAIGN_TABLE}
        WHERE call_direction = 'OUTBOUND_TELCO'
          AND {date_filter}
          AND pre_call_intent IS NOT NULL
          AND pre_call_intent NOT IN ('null', '')
        GROUP BY pre_call_intent
        ORDER BY total_calls DESC
    """)
    rows = cur.fetchall()

    campaigns = []
    for campaign, total, avg_dur, cust_hung, bot_hung in rows:
        answered = (cust_hung or 0) + (bot_hung or 0)
        answer_rate = round(answered / total * 100, 1) if total else 0.0
        campaigns.append({
            "name":            campaign,
            "category":        _campaign_category(campaign),
            "total_calls":     total or 0,
            "avg_duration":    int(avg_dur or 0),
            "answer_rate":     answer_rate,
            "customer_hangups": cust_hung or 0,
            "bot_hangups":      bot_hung or 0,
            "since":           since,
            "until":           until,
        })
    return campaigns


def fetch_campaign_analysis(campaign: str, date_range: str = "last_7_days") -> Dict[str, Any]:
    """
    Return detailed analytics for a single outbound campaign.
    """
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT MAX(dl_last_updated)
        FROM {CAMPAIGN_TABLE}
        WHERE dl_last_updated >= DATE '2025-01-01'
          AND call_direction = 'OUTBOUND_TELCO'
    """)
    max_date = cur.fetchone()[0]
    since, until = _resolve_date_range(max_date, date_range)
    date_filter = f"dl_last_updated BETWEEN DATE '{since}' AND DATE '{until}'"

    # ── Summary ──────────────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT
            COUNT(*)                                                            AS total_calls,
            ROUND(AVG(call_duration_seconds), 0)                               AS avg_duration,
            MIN(call_duration_seconds)                                          AS min_duration,
            MAX(call_duration_seconds)                                          AS max_duration,
            SUM(CASE WHEN disconnection_source = 'far_end'  THEN 1 ELSE 0 END) AS customer_hangups,
            SUM(CASE WHEN disconnection_source = 'near_end' THEN 1 ELSE 0 END) AS bot_hangups,
            SUM(CASE WHEN call_duration_seconds >= 30       THEN 1 ELSE 0 END) AS meaningful_calls
        FROM {CAMPAIGN_TABLE}
        WHERE call_direction = 'OUTBOUND_TELCO'
          AND {date_filter}
          AND pre_call_intent = '{campaign}'
    """)
    r = cur.fetchone()
    total, avg_dur, min_dur, max_dur, cust_hung, bot_hung, meaningful = r

    total       = total      or 0
    avg_dur     = int(avg_dur    or 0)
    cust_hung   = cust_hung  or 0
    bot_hung    = bot_hung   or 0
    meaningful  = meaningful or 0

    answered    = cust_hung + bot_hung
    answer_rate = round(answered / total * 100, 1) if total else 0.0
    engagement  = round(meaningful / total * 100, 1) if total else 0.0

    # ── Daily trend ──────────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT
            dl_last_updated                                                     AS day,
            COUNT(*)                                                            AS calls,
            ROUND(AVG(call_duration_seconds), 0)                               AS avg_dur
        FROM {CAMPAIGN_TABLE}
        WHERE call_direction = 'OUTBOUND_TELCO'
          AND {date_filter}
          AND pre_call_intent = '{campaign}'
        GROUP BY dl_last_updated
        ORDER BY dl_last_updated
    """)
    daily_trend = [
        {"date": str(day), "calls": cnt, "avg_duration": int(avg or 0)}
        for day, cnt, avg in cur.fetchall()
    ]

    # ── Duration buckets ─────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT
            SUM(CASE WHEN call_duration_seconds < 10                         THEN 1 ELSE 0 END) AS lt10,
            SUM(CASE WHEN call_duration_seconds BETWEEN 10 AND 29            THEN 1 ELSE 0 END) AS s10_30,
            SUM(CASE WHEN call_duration_seconds BETWEEN 30 AND 59            THEN 1 ELSE 0 END) AS s30_60,
            SUM(CASE WHEN call_duration_seconds BETWEEN 60 AND 119           THEN 1 ELSE 0 END) AS s60_120,
            SUM(CASE WHEN call_duration_seconds BETWEEN 120 AND 299          THEN 1 ELSE 0 END) AS s120_300,
            SUM(CASE WHEN call_duration_seconds >= 300                       THEN 1 ELSE 0 END) AS gt300
        FROM {CAMPAIGN_TABLE}
        WHERE call_direction = 'OUTBOUND_TELCO'
          AND {date_filter}
          AND pre_call_intent = '{campaign}'
    """)
    b = cur.fetchone()
    duration_buckets = [
        {"label": "< 10s",    "count": b[0] or 0},
        {"label": "10–30s",   "count": b[1] or 0},
        {"label": "30–60s",   "count": b[2] or 0},
        {"label": "1–2 min",  "count": b[3] or 0},
        {"label": "2–5 min",  "count": b[4] or 0},
        {"label": "> 5 min",  "count": b[5] or 0},
    ]

    # ── Session list ─────────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT
            session_id,
            call_duration_seconds,
            status,
            start_time,
            disconnection_source,
            recording_url
        FROM {CAMPAIGN_TABLE}
        WHERE call_direction = 'OUTBOUND_TELCO'
          AND {date_filter}
          AND pre_call_intent = '{campaign}'
          AND call_duration_seconds > 0
        ORDER BY start_time DESC
        LIMIT 500
    """)
    sessions = [
        {
            "session_id":           sid,
            "duration":             dur or 0,
            "status":               st or "—",
            "start_time":           str(ts) if ts else None,
            "disconnection_source": disc or "—",
            "recording_url":        rec or None,
        }
        for sid, dur, st, ts, disc, rec in cur.fetchall()
    ]

    return {
        "campaign":         campaign,
        "since":            since,
        "until":            until,
        "total_calls":      total,
        "avg_duration":     avg_dur,
        "min_duration":     min_dur or 0,
        "max_duration":     max_dur or 0,
        "answer_rate":      answer_rate,
        "engagement_rate":  engagement,
        "customer_hangups": cust_hung,
        "bot_hangups":      bot_hung,
        "meaningful_calls": meaningful,
        "daily_trend":      daily_trend,
        "duration_buckets": duration_buckets,
        "sessions":         sessions,
        "generated_at":     datetime.utcnow().isoformat(),
    }
