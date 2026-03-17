"""
Trino queries for Outbound Campaign analytics.
Table: hive.mhd_crm_cst.cs_call_details_record_snapshot_v3
"""

import json as _json
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List

from ingestion.trino_helpdesk import _connect, _resolve_date_range, _detect_lang, TONE_SCORE, _score_to_label

CAMPAIGN_TABLE = "hive.mhd_crm_cst.cs_call_details_record_snapshot_v3"
EVAL_TABLE     = "hive.mhd_crm_cst.feedback_complete_analyzed_data_snapshot_v3"

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

    # ── Issues from eval table (session_id = ticket_id JOIN) ─────────────────
    # Tone counts per issue for sentiment
    cur.execute(f"""
        SELECT f.out_key_problem_desc, f.out_merchant_tone, COUNT(*) AS cnt
        FROM {CAMPAIGN_TABLE} c
        JOIN {EVAL_TABLE} f ON c.session_id = f.ticket_id
        WHERE c.call_direction = 'OUTBOUND_TELCO'
          AND c.dl_last_updated BETWEEN DATE '{since}' AND DATE '{until}'
          AND c.pre_call_intent = '{campaign}'
          AND f.dl_last_updated >= DATE '2025-01-01'
          AND f.task_status = 'completed'
          AND f.out_key_problem_desc IS NOT NULL
          AND f.out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
        GROUP BY f.out_key_problem_desc, f.out_merchant_tone
    """)
    issue_tone_rows = cur.fetchall()

    # Sample comments per issue — include c.start_time so UI can build recording URL
    cur.execute(f"""
        SELECT f.out_key_problem_desc, f.out_key_problem_sub_desc,
               f.ticket_id, f.out_merchant_tone, c.start_time
        FROM {CAMPAIGN_TABLE} c
        JOIN {EVAL_TABLE} f ON c.session_id = f.ticket_id
        WHERE c.call_direction = 'OUTBOUND_TELCO'
          AND c.dl_last_updated BETWEEN DATE '{since}' AND DATE '{until}'
          AND c.pre_call_intent = '{campaign}'
          AND f.dl_last_updated >= DATE '2025-01-01'
          AND f.task_status = 'completed'
          AND f.out_key_problem_desc IS NOT NULL
          AND f.out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
          AND f.out_key_problem_sub_desc IS NOT NULL
          AND f.out_key_problem_sub_desc NOT IN ('Others', 'NA', 'None', '')
        LIMIT 2000
    """)
    comment_rows = cur.fetchall()

    # ── Batch-fetch function call names for all sampled sessions ─────────────
    unique_tids = list({row[2] for row in comment_rows if row[2]})
    fn_calls_by_tid: Dict[str, List[str]] = defaultdict(list)
    if unique_tids:
        tids_sql = "', '".join(t.replace("'", "''") for t in unique_tids)
        conv_table = "hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3"
        cur.execute(f"""
            SELECT ticket_id, content
            FROM {conv_table}
            WHERE ticket_id IN ('{tids_sql}')
              AND dl_last_updated >= DATE '2025-01-01'
              AND type = 'function_call_output'
            ORDER BY created_at
        """)
        for tid, content_str in cur.fetchall():
            fn_name = None
            try:
                outer = _json.loads(content_str or '{}')
                inner_str = outer.get('content', '')
                if isinstance(inner_str, str):
                    inner_str = inner_str.replace('\\"', '"').replace('\\\\', '\\')
                    inner = _json.loads(inner_str)
                else:
                    inner = inner_str
                fn_name = inner.get('name') or inner.get('function_name')
            except Exception:
                pass
            if fn_name and fn_name not in fn_calls_by_tid[tid]:
                fn_calls_by_tid[tid].append(fn_name)

    # ── Aggregate
    l1_data: Dict[str, Dict] = defaultdict(lambda: {"total": 0, "tone_counts": defaultdict(int)})
    for l1, tone, cnt in issue_tone_rows:
        l1_data[l1]["total"] += cnt
        l1_data[l1]["tone_counts"][tone or "neutral"] += cnt

    comments_by_l1: Dict[str, List] = defaultdict(list)
    for l1, comment, ticket_id, tone, start_time in comment_rows:
        if l1 and comment and len(comments_by_l1[l1]) < 10:
            date_str = str(start_time)[:10] if start_time else None
            fn_calls = fn_calls_by_tid.get(ticket_id, []) or []
            comments_by_l1[l1].append((comment, ticket_id, tone, _detect_lang(comment), date_str, fn_calls))

    sorted_l1 = sorted(l1_data.items(), key=lambda x: x[1]["total"], reverse=True)
    issue_total = sum(d["total"] for _, d in sorted_l1)

    top_issues = []
    for l1, data in sorted_l1[:15]:
        l1_total = data["total"]
        tone_counts = data["tone_counts"]
        weighted_sum = sum(TONE_SCORE.get(t, 0.0) * c for t, c in tone_counts.items())
        avg_score = weighted_sum / l1_total if l1_total else 0.0
        issue_comments = comments_by_l1.get(l1, [])
        top_issues.append({
            "label":                  l1,
            "count":                  l1_total,
            "percentage":             round(l1_total / issue_total * 100, 1) if issue_total else 0.0,
            "avg_sentiment":          round(avg_score, 2),
            "sentiment_label":        _score_to_label(avg_score),
            "example_comments":       [c[0] for c in issue_comments],
            "comment_ticket_ids":     [c[1] for c in issue_comments],
            "comment_tones":          [c[2] for c in issue_comments],
            "comment_langs":          [c[3] for c in issue_comments],
            "comment_dates":          [c[4] for c in issue_comments],
            "comment_ratings":        [None  for c in issue_comments],
            "comment_function_calls": [c[5] for c in issue_comments],
        })

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
        "top_issues":       top_issues,
        "generated_at":     datetime.utcnow().isoformat(),
    }
