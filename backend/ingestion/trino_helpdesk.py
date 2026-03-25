"""
Trino-based analytics for the Helpdesk channel.

Queries hive.crm_cst.feedback_complete_analyzed_data_snapshot_v3
and returns structured insights compatible with InsightsResponse.
"""

import os
import json as _json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Any, Dict, List, Optional

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

# DB schema per helpdesk type (used for conversation / analytics / eval tables)
DB_SCHEMA: Dict[str, str] = {
    "merchant": "mhd_crm_cst",
    "customer": "crm_cst",
}

# Map product slugs → CST entities in Trino (merchant)
CST_ENTITY_MAP: Dict[str, str] = {
    "loan":                  "p4bbusinessloan",
    "payments_settlement":   "p4bpayoutandsettlement",
    "soundbox":              "p4bsoundbox",
    "profile":               "p4bprofile",
    "card_machine":          "p4bedc",
    "wealth":                "p4bwealth",
}

# Map product slugs → CST entities in Trino (customer)
# Key = UI slug (same as cst_entity), value = cst_entity in Trino
CUSTOMER_CST_ENTITY_MAP: Dict[str, str] = {
    # Travel
    "bus":                     "bus",
    "flight":                  "flight",
    "train":                   "train",
    # Investments
    "gold":                    "gold",
    "pspl":                    "pspl",
    # ONDC
    "ondc-commerce":           "ondc-commerce",
    # Personal Loan
    "personalloan":            "personalloan",
    # Profile
    "paytm-profile":           "paytm-profile",
    # UPI
    "upi-ocl":                 "upi-ocl",
    # Recharge & Utilities
    "ccbp":                    "ccbp",
    "challan":                 "challan",
    "citybus":                 "citybus",
    "creditcard":              "creditcard",
    "cylinder":                "cylinder",
    "digital-subscriptions":   "digital-subscriptions",
    "dth":                     "dth",
    "electricity":             "electricity",
    "fastag":                  "fastag",
    "gas":                     "gas",
    "insurance":               "insurance",
    "landline":                "landline",
    "loan":                    "loan",
    "metro":                   "metro",
    "mobilepostpaid":          "mobilepostpaid",
    "mobileprepaid":           "mobileprepaid",
    "mortgage":                "mortgage",
    "municipal":               "municipal",
    "ru_education":            "ru_education",
    "ru_insurance":            "ru_insurance",
    "voucher":                 "voucher",
    "water":                   "water",
    "apartment":               "apartment",
    "cabletv":                 "cabletv",
    "creditline":              "creditline",
    "datacard":                "datacard",
    "donation":                "donation",
    "entertainment":           "entertainment",
    "gprc":                    "gprc",
    "loanagainstmutualfund":   "loanagainstmutualfund",
    "paytmdeals":              "paytmdeals",
    "postpaid":                "postpaid",
    "recharge":                "recharge",
    "rent":                    "rent",
    "retailinsurance":         "retailinsurance",
    "toll":                    "toll",
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

def _detect_lang(text: str) -> str:
    """Detect language from script ranges in the text."""
    for ch in (text or ""):
        if '\u0900' <= ch <= '\u097F': return 'hi'   # Devanagari (Hindi/Marathi)
        if '\u0B80' <= ch <= '\u0BFF': return 'ta'   # Tamil
        if '\u0C00' <= ch <= '\u0C7F': return 'te'   # Telugu
        if '\u0C80' <= ch <= '\u0CFF': return 'kn'   # Kannada
        if '\u0980' <= ch <= '\u09FF': return 'bn'   # Bengali
        if '\u0A80' <= ch <= '\u0AFF': return 'gu'   # Gujarati
        if '\u0A00' <= ch <= '\u0A7F': return 'pa'   # Punjabi
        if '\u0D00' <= ch <= '\u0D7F': return 'ml'   # Malayalam
    return 'en'


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

def _resolve_date_range(max_date, date_range: str):
    """
    Convert a date_range slug into (since, until) strings anchored to max_date
    (the latest available date in the table). This ensures we always return data
    even when the pipeline is behind by days or months.
    Both bounds are inclusive.
    """
    if date_range == "yesterday":
        d = max_date - timedelta(days=1)
        return d.strftime("%Y-%m-%d"), d.strftime("%Y-%m-%d")
    if date_range == "day_before_yesterday":
        d = max_date - timedelta(days=2)
        return d.strftime("%Y-%m-%d"), d.strftime("%Y-%m-%d")
    if date_range == "last_30_days":
        return (max_date - timedelta(days=30)).strftime("%Y-%m-%d"), max_date.strftime("%Y-%m-%d")
    # default: last_7_days
    return (max_date - timedelta(days=7)).strftime("%Y-%m-%d"), max_date.strftime("%Y-%m-%d")


def fetch_helpdesk_insights(product: str, helpdesk_type: str = "merchant",
                            date_range: str = "last_7_days") -> Dict[str, Any]:
    """
    Query Trino and return a dict that maps directly to InsightsResponse fields.

    Funnel (mirrors master_queries.sql pattern — see CST_DATA_GUIDE.md):
      support_ticket_details_snapshot_v3      → base session count (total_sessions)
      feedback_complete_analyzed_snapshot_v3  → L1/L2 tags, eval, tone (LEFT JOIN on ticket_id)
      ticket_meta_snapshot_v3                 → MSAT feedback_status (LEFT JOIN on ticket_id)

    Key rules:
      - dl_last_updated: mandatory Trino partition filter on every table — NEVER used for
        business date logic or grouping.
      - DATE(s.created_at): sole session business date column for filtering and grouping.
      - feedback_complete_analyzed.created_at is the eval job timestamp (D+1), not session
        date — do NOT filter on it. Date scoping is handled via the JOIN to session base.
      - Row presence in feedback_complete_analyzed = eval job ran. No task_status filter needed.
      - INNER JOIN for analysis queries: restricts to sessions where eval ran AND tags are valid.

    Args:
        product:       product slug (e.g. "loan", "soundbox", "train", "flight")
        helpdesk_type: "merchant" or "customer"
        date_range:    one of last_7_days | last_30_days | yesterday | day_before_yesterday
    """
    entity_map     = CUSTOMER_CST_ENTITY_MAP if helpdesk_type == "customer" else CST_ENTITY_MAP
    cst_entity     = entity_map.get(product, product)
    schema         = DB_SCHEMA.get(helpdesk_type, "crm_cst")
    session_table  = f"hive.{schema}.support_ticket_details_snapshot_v3"
    feedback_table = f"hive.{schema}.feedback_complete_analyzed_data_snapshot_v3"
    meta_table     = f"hive.{schema}.ticket_meta_snapshot_v3"

    conn = _connect()
    cur  = conn.cursor()

    # ── 1. Max date anchor — always from the base session table ───────────────
    # Use DATE(created_at) for business date logic.
    # dl_last_updated is a mandatory Trino partition filter only — never use it
    # for date grouping or range logic. See CST_DATA_GUIDE.md §4.
    cur.execute(f"""
        SELECT MAX(DATE(created_at))
        FROM {session_table}
        WHERE cst_entity = '{cst_entity}'
          AND dl_last_updated >= DATE '2025-01-01'
    """)
    max_date = cur.fetchone()[0]
    if max_date is None:
        raise ValueError(f"No data found for entity '{cst_entity}'.")

    since, until   = _resolve_date_range(max_date, date_range)
    date_label     = since if since == until else f"{since} → {until}"
    user_label     = "customers" if helpdesk_type == "customer" else "merchants"

    # ── 2. Core funnel — single query: total sessions, analysed count, MSAT ───
    # Base: support_ticket_details (one row per session, keyed on id).
    # LEFT JOIN feedback_complete_analyzed on ticket_id = id:
    #   row presence = eval job ran; no task_status filter needed.
    # LEFT JOIN ticket_meta on ticket_id = id: MSAT feedback_status.
    # COUNT(DISTINCT fa.ticket_id) = sessions where eval ran (total_analysed).
    # All dl_last_updated filters are mandatory Trino partition pruning only.
    cur.execute(f"""
        SELECT
            COUNT(DISTINCT s.id)                                                       AS total_sessions,
            COUNT(DISTINCT fa.ticket_id)                                               AS total_analysed,
            COUNT(DISTINCT CASE WHEN tm.feedback_status = '2' THEN s.id END)           AS happy,
            COUNT(DISTINCT CASE WHEN tm.feedback_status = '3' THEN s.id END)           AS sad,
            COUNT(DISTINCT CASE WHEN tm.feedback_status = '4' THEN s.id END)           AS skipped
        FROM {session_table} s
        LEFT JOIN {feedback_table} fa
               ON fa.ticket_id = s.id
              AND fa.dl_last_updated >= DATE '2025-01-01'
        LEFT JOIN {meta_table} tm
               ON tm.ticket_id = s.id
              AND tm.dl_last_updated >= DATE '2025-01-01'
        WHERE s.cst_entity = '{cst_entity}'
          AND s.dl_last_updated >= DATE '2025-01-01'
          AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
    """)
    row            = cur.fetchone()
    total_sessions = row[0] or 0
    total_analysed = row[1] or 0
    happy          = row[2] or 0
    sad            = row[3] or 0
    skipped        = row[4] or 0

    # ── FALLBACK: eval job hasn't run yet for this date range ─────────────────
    if total_analysed == 0:
        ai_summary = (
            f"Analysis data not yet available for {cst_entity} ({date_label}). "
            f"Showing raw session data: {total_sessions:,} sessions. "
            f"MSAT — Happy: {happy}, Sad: {sad}, Skip: {skipped}."
        )
        return {
            "total_feedback":            total_sessions,
            "total_sessions":            total_sessions,
            "total_analysed":            0,
            "channels_analysed":         ["Helpdesk"],
            "top_issues":                [],
            "social_media_threat_count": 0,
            "social_media_threat_pct":   0.0,
            "sentiment_distribution":    {
                "positive": happy,
                "neutral":  skipped,
                "negative": sad,
                "total":    total_sessions,
            },
            "trending_issues": [],
            "ai_summary":      ai_summary,
            "generated_at":    datetime.utcnow().isoformat(),
            "data_from":       since,
            "data_until":      until,
            "is_raw_fallback": True,
        }

    # ── FULL ANALYSIS PATH ────────────────────────────────────────────────────
    # All queries below INNER JOIN session base → feedback_complete_analyzed.
    # INNER JOIN restricts to sessions where eval ran AND tags are valid.
    # Sessions with failed/null eval are excluded from L1/L2 display but still
    # counted in total_sessions. Percentages use total_analysed as denominator.
    # dl_last_updated is partition filter only. DATE(s.created_at) = date logic.

    # 3. L1 issues with tone — eval-run sessions with valid tags only
    cur.execute(f"""
        SELECT fa.out_key_problem_desc, fa.out_merchant_tone, COUNT(*) AS cnt
        FROM {session_table} s
        JOIN {feedback_table} fa
          ON fa.ticket_id = s.id
         AND fa.dl_last_updated >= DATE '2025-01-01'
        WHERE s.cst_entity = '{cst_entity}'
          AND s.dl_last_updated >= DATE '2025-01-01'
          AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
          AND fa.out_key_problem_desc IS NOT NULL
          AND fa.out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
        GROUP BY fa.out_key_problem_desc, fa.out_merchant_tone
    """)
    issue_tone_rows = cur.fetchall()

    # 4. Social media threat — eval-run sessions
    cur.execute(f"""
        SELECT
            COUNT(*)                                                                          AS total,
            SUM(CASE WHEN fa.social_media_threat IN ('YES', 'हाँ', 'हां') THEN 1 ELSE 0 END) AS threat_count
        FROM {session_table} s
        JOIN {feedback_table} fa
          ON fa.ticket_id = s.id
         AND fa.dl_last_updated >= DATE '2025-01-01'
        WHERE s.cst_entity = '{cst_entity}'
          AND s.dl_last_updated >= DATE '2025-01-01'
          AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
    """)
    threat_row   = cur.fetchone()
    threat_total = threat_row[0] or 0
    threat_count = threat_row[1] or 0
    threat_pct   = round(threat_count / threat_total * 100, 2) if threat_total > 0 else 0.0

    # 5. Sample comments — L1 + L2 label, ticket_id, tone, session date
    # DATE(s.created_at) is the correct session date column (not dl_last_updated)
    cur.execute(f"""
        SELECT fa.out_key_problem_desc, fa.out_key_problem_sub_desc,
               fa.ticket_id, fa.out_merchant_tone, DATE(s.created_at)
        FROM {session_table} s
        JOIN {feedback_table} fa
          ON fa.ticket_id = s.id
         AND fa.dl_last_updated >= DATE '2025-01-01'
        WHERE s.cst_entity = '{cst_entity}'
          AND s.dl_last_updated >= DATE '2025-01-01'
          AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
          AND fa.out_key_problem_desc IS NOT NULL
          AND fa.out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
          AND fa.out_key_problem_sub_desc IS NOT NULL
          AND fa.out_key_problem_sub_desc NOT IN ('Others', 'NA', 'None', '')
        LIMIT 2000
    """)
    comment_rows = cur.fetchall()

    # 6. L2 counts per L1
    cur.execute(f"""
        SELECT fa.out_key_problem_desc, fa.out_key_problem_sub_desc, COUNT(*) AS cnt
        FROM {session_table} s
        JOIN {feedback_table} fa
          ON fa.ticket_id = s.id
         AND fa.dl_last_updated >= DATE '2025-01-01'
        WHERE s.cst_entity = '{cst_entity}'
          AND s.dl_last_updated >= DATE '2025-01-01'
          AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
          AND fa.out_key_problem_desc IS NOT NULL
          AND fa.out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
          AND fa.out_key_problem_sub_desc IS NOT NULL
          AND fa.out_key_problem_sub_desc NOT IN ('Others', 'NA', 'None', '')
        GROUP BY fa.out_key_problem_desc, fa.out_key_problem_sub_desc
    """)
    l2_count_rows = cur.fetchall()

    # ── Aggregate L1 ──────────────────────────────────────────────────────────

    l1_data: Dict[str, Dict] = defaultdict(
        lambda: {"total": 0, "tone_counts": defaultdict(int)}
    )
    for l1, tone, cnt in issue_tone_rows:
        l1_data[l1]["total"] += cnt
        l1_data[l1]["tone_counts"][tone or "neutral"] += cnt

    # Build per-(L1, L2) sample bank
    samples_by_l2:  Dict[tuple, List[tuple]] = defaultdict(list)
    comments_by_l1: Dict[str, List[tuple]]   = defaultdict(list)
    for l1, l2_text, ticket_id, tone, row_date in comment_rows:
        date_str = str(row_date) if row_date else None
        if len(samples_by_l2[(l1, l2_text)]) < 20:
            samples_by_l2[(l1, l2_text)].append((ticket_id, tone, date_str))
        if l1 and l2_text and len(comments_by_l1[l1]) < 10:
            comments_by_l1[l1].append((l2_text, ticket_id, tone, _detect_lang(l2_text), date_str))

    # Build L2 sub_categories per L1
    # L2 percentage is relative to its parent L1 count (not total_analysed)
    l2_counts: Dict[str, Dict[str, int]] = defaultdict(dict)
    for l1, l2, cnt in l2_count_rows:
        l2_counts[l1][l2] = cnt

    sub_cats_by_l1: Dict[str, List] = {}
    for l1, l2_map in l2_counts.items():
        l1_total_for_pct = l1_data[l1]["total"] if l1 in l1_data else total_analysed
        subs = []
        for l2, cnt in sorted(l2_map.items(), key=lambda x: -x[1]):
            samples = samples_by_l2.get((l1, l2), [])
            subs.append({
                "label":         l2,
                "count":         cnt,
                "percentage":    round(cnt / l1_total_for_pct * 100, 1) if l1_total_for_pct else 0.0,
                "ticket_ids":    [s[0] for s in samples],
                "comment_tones": [s[1] for s in samples],
                "comment_dates": [s[2] for s in samples],
            })
        sub_cats_by_l1[l1] = subs

    top_issues = []
    for l1, data in sorted(l1_data.items(), key=lambda x: x[1]["total"], reverse=True)[:10]:
        l1_total     = data["total"]
        tone_counts  = data["tone_counts"]
        weighted_sum = sum(TONE_SCORE.get(t, 0.0) * c for t, c in tone_counts.items())
        avg_score    = weighted_sum / l1_total if l1_total else 0.0
        issue_comments = comments_by_l1.get(l1, [])
        top_issues.append({
            "label":              l1,
            "count":              l1_total,
            "percentage":         round(l1_total / total_analysed * 100, 1) if total_analysed else 0.0,
            "avg_sentiment":      round(avg_score, 2),
            "sentiment_label":    _score_to_label(avg_score),
            "example_comments":   [c[0] for c in issue_comments],
            "comment_ticket_ids": [c[1] for c in issue_comments],
            "comment_tones":      [c[2] for c in issue_comments],
            "comment_langs":      [c[3] for c in issue_comments],
            "comment_dates":      [c[4] for c in issue_comments],
            "comment_ratings":    [None  for c in issue_comments],
            "channels":           {"helpdesk": l1_total},
            "sub_categories":     sub_cats_by_l1.get(l1, []),
        })

    # ── Sentiment distribution — MSAT takes priority, tone as fallback ────────
    if (happy + sad + skipped) > 0:
        positive = happy
        negative = sad
        neutral  = skipped
    else:
        positive = neutral = negative = 0
        # tone-based fallback — join via session base table
        cur.execute(f"""
            SELECT fa.out_merchant_tone, COUNT(*) AS cnt
            FROM {session_table} s
            JOIN {feedback_table} fa
              ON fa.ticket_id = s.id
             AND fa.dl_last_updated >= DATE '2025-01-01'
            WHERE s.cst_entity = '{cst_entity}'
              AND s.dl_last_updated >= DATE '2025-01-01'
              AND DATE(s.created_at) BETWEEN DATE '{since}' AND DATE '{until}'
            GROUP BY fa.out_merchant_tone
        """)
        for tone, cnt in cur.fetchall():
            score = TONE_SCORE.get(tone or "neutral", 0.0)
            if score >= 0.2:    positive += cnt
            elif score <= -0.2: negative += cnt
            else:               neutral  += cnt

    # ── AI summary ────────────────────────────────────────────────────────────
    top_label = top_issues[0]["label"] if top_issues else "N/A"
    top_pct   = top_issues[0]["percentage"] if top_issues else 0
    neg_pct   = round(negative / total_sessions * 100, 1) if total_sessions else 0
    ai_summary = (
        f"Analysed {total_sessions:,} helpdesk sessions for {cst_entity} ({date_label}). "
        f"{total_analysed:,} sessions ({round(total_analysed/total_sessions*100) if total_sessions else 0}%) have eval data. "
        f"Top complaint: '{top_label}' ({top_pct}% of analysed). "
        f"{neg_pct}% of {user_label} expressed frustration. "
        f"Top trending issues: {', '.join(i['label'] for i in top_issues[:3])}."
    )

    return {
        "total_feedback":            total_sessions,
        "total_sessions":            total_sessions,
        "total_analysed":            total_analysed,
        "channels_analysed":         ["Helpdesk"],
        "top_issues":                top_issues,
        "social_media_threat_count": threat_count,
        "social_media_threat_pct":   threat_pct,
        "sentiment_distribution":    {
            "positive": positive,
            "neutral":  neutral,
            "negative": negative,
            "total":    total_sessions,
        },
        "trending_issues": [i["label"] for i in top_issues[:3]],
        "ai_summary":      ai_summary,
        "generated_at":    datetime.utcnow().isoformat(),
        "data_from":       since,
        "data_until":      until,
    }


# ── Transcript fetch ───────────────────────────────────────────────────────────

CONV_TABLE_TMPL = "hive.{schema}.ticket_session_conversation_snapshot_v3"

_ROLE_MAP = {"1": "user", "2": "assistant", 1: "user", 2: "assistant"}


def fetch_transcript(ticket_id: str, helpdesk_type: str = "merchant") -> List[Dict[str, Any]]:
    """
    Fetch all conversation messages for a given ticket_id.
    Returns a list of message dicts ordered by created_at.
    Excludes auto-generated TRANSCRIPT rows.
    """
    schema = DB_SCHEMA.get(helpdesk_type, "mhd_crm_cst")
    conv_table = CONV_TABLE_TMPL.format(schema=schema)
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT message_id, role, type, content, meta, created_at, question_language_code
        FROM {conv_table}
        WHERE ticket_id = '{ticket_id}'
          AND dl_last_updated >= DATE '2025-01-01'
          AND (type IS NULL OR type NOT IN ('TRANSCRIPT', 'function_call_output'))
        ORDER BY created_at
    """)

    import re as _re

    messages = []
    for message_id, role, msg_type, content_str, meta_str, created_at, lang_code in cur.fetchall():
        # Parse content JSON → plain text
        text = content_str or ""
        try:
            text = _json.loads(content_str or "{}").get("content", content_str or "")
        except Exception:
            pass

        # Strip RequestMessage(user=...) and MediaMessage(user=..., mediaId=...) wrappers
        rm_match = _re.match(r'^(?:Request|Media)Message\(user=(.*?)(?:,\s*mediaId=[^)]+)?\)$', text.strip(), _re.DOTALL)
        if rm_match:
            text = rm_match.group(1).strip()

        # Skip internal JSON messages: status acks, intent routing, function call responses
        try:
            parsed = _json.loads(text)
            if isinstance(parsed, dict) and any(k in parsed for k in (
                "status", "current_intent", "fetchOffer",
                "FCResponse", "event_id", "result",
            )):
                continue
        except Exception:
            pass

        # Skip empty content
        if not text.strip():
            continue

        # Parse meta → hidden flag + CTA options
        hidden = False
        cta_options: List[str] = []
        try:
            meta = _json.loads(meta_str or "{}")
            hidden = bool(meta.get("hideMessage", False))
            cta_options = [
                c.get("ctaLabel", "")
                for c in meta.get("ctaList", [])
                if c.get("ctaLabel")
            ]
        except Exception:
            pass

        messages.append({
            "message_id":  message_id,
            "role":        _ROLE_MAP.get(role, "system"),
            "type":        msg_type,
            "content":     text,
            "hidden":      hidden,
            "cta_options": cta_options,
            "lang":        lang_code or None,
            "created_at":  created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        })

    return messages


# ── Function calls fetch ───────────────────────────────────────────────────────

def fetch_function_calls(ticket_id: str, helpdesk_type: str = "merchant") -> List[Dict[str, Any]]:
    """
    Fetch all function-call and full-transcript rows for a given ticket_id.
    These are excluded from the normal chat transcript but contain rich
    API call data and the IVR call transcript text.
    """
    schema = DB_SCHEMA.get(helpdesk_type, "mhd_crm_cst")
    conv_table = CONV_TABLE_TMPL.format(schema=schema)
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT message_id, type, content, created_at
        FROM {conv_table}
        WHERE ticket_id = '{ticket_id}'
          AND dl_last_updated >= DATE '2025-01-01'
          AND type IN ('function_call_output', 'function_call', 'TRANSCRIPT')
        ORDER BY created_at
    """)

    calls = []
    for message_id, msg_type, content_str, created_at in cur.fetchall():
        raw = content_str or ""
        data: Any = raw
        try:
            parsed = _json.loads(raw)
            # Some function_call rows are double-encoded strings
            if isinstance(parsed, str):
                try:
                    parsed = _json.loads(parsed)
                except Exception:
                    pass
            data = parsed
        except Exception:
            pass

        calls.append({
            "message_id": message_id,
            "type":       msg_type,
            "data":       data,
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        })

    return calls


# ── Master data fetch ──────────────────────────────────────────────────────────

ANALYTICS_TABLE_TMPL = "hive.{schema}.vertical_analytics_data_snapshot_v3"

# Section definitions: (key, title, icon, [data_keys])
_SECTIONS = [
    ("merchant_profile",  "Merchant Profile",       "🏪", [
        "merchantCategory", "merchantType", "whiteListed", "pv",
        "numberOfDevices", "numberOfSoundbox", "activeLoan", "activeLoanLending",
        "isEligibleForParkedWithBotTicket", "isTestAlertAllowed",
    ]),
    ("merchant_address",  "Merchant Address",        "📍", [
        "cf_merchant_address_line", "service_request_params",
    ]),
    ("soundbox_hardware", "Soundbox Hardware",       "🔊", [
        "soundboxHardwareDetails", "deviceId",
    ]),
    ("soundbox_rental",   "Soundbox Rental",         "💳", [
        "soundboxRentalDetails",
    ]),
    ("loan_info",         "Loan Information",        "💰", [
        "loanInformationDetails",
    ]),
    ("edi_history",       "EDI / Payment History",   "📅", [
        "loanEdiDetails",
    ]),
    ("loan_application",  "Loan Application",        "📋", [
        "loanApplicationDetails",
    ]),
    ("loan_offer",        "Loan Offer",              "🎯", [
        "loanOfferDetails",
    ]),
    ("bot_offer",         "Bot Pitch",               "💬", [
        "fetchOffer",
    ]),
    ("freshdesk",         "FreshDesk Config",        "🎫", [
        "create_fd_params",
    ]),
    ("deep_links",        "Deep Links",              "🔗", [
        "deepLinks",
    ]),
]


def fetch_master_data(ticket_id: str, helpdesk_type: str = "merchant") -> Optional[Dict[str, Any]]:
    """
    Fetch and parse master data for a given ticket_id from vertical_analytics_data_snapshot_v3.
    Returns a MasterDataResponse-compatible dict, or None if no data found.
    """
    schema         = DB_SCHEMA.get(helpdesk_type, "mhd_crm_cst")
    analytics_table = ANALYTICS_TABLE_TMPL.format(schema=schema)
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT customer_id, cst_entity, workflow, intent, created_at,
               plugservice_response, conversation_variables
        FROM {analytics_table}
        WHERE ticket_id = '{ticket_id}'
          AND dl_last_updated >= DATE '2025-01-01'
          AND plugservice_response IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
    """)

    row = cur.fetchone()
    if not row:
        return None

    customer_id, cst_entity, workflow, intent, created_at, raw_resp, conv_vars = row

    # Parse double-encoded JSON
    data: Dict[str, Any] = {}
    try:
        stripped = raw_resp.strip()
        if stripped.startswith('"') and stripped.endswith('"'):
            stripped = stripped[1:-1]
        unescaped = stripped.replace('\\"', '"').replace('\\\\', '\\')
        parsed = _json.loads(unescaped)
        data = parsed.get('data', parsed)
    except Exception:
        pass

    # Parse conversation_variables
    conv: Dict[str, Any] = {}
    try:
        conv = _json.loads(conv_vars) if conv_vars else {}
    except Exception:
        pass

    # Build sections — only include sections that have at least one key present in data
    sections = []
    for key, title, icon, data_keys in _SECTIONS:
        section_data = {k: data[k] for k in data_keys if k in data}
        if section_data:
            sections.append({"key": key, "title": title, "icon": icon, "data": section_data})

    # Always append conversation context if available
    if conv:
        sections.append({
            "key":   "conversation",
            "title": "Conversation Context",
            "icon":  "🗣️",
            "data":  conv,
        })

    return {
        "ticket_id":   ticket_id,
        "customer_id": str(customer_id) if customer_id else None,
        "cst_entity":  cst_entity,
        "workflow":    workflow.strip('"') if workflow else None,
        "intent":      intent,
        "created_at":  created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        "sections":    sections,
    }


# ── Eval fetch ─────────────────────────────────────────────────────────────────

EVAL_TABLE_TMPL = "hive.{schema}.feedback_complete_analyzed_data_snapshot_v3"

# Metric definitions: (key, label, threshold_for_good)
# threshold_for_good: value >= threshold → went_right, else went_wrong
_EVAL_METRICS = [
    ("empathy_score",             "Empathy",                  0.6),
    ("resolution_achieved",       "Resolution Achieved",      0.7),
    ("response_relevance_score",  "Response Relevance",       0.7),
    ("customer_satisfaction",     "Customer Satisfaction",    0.7),
    ("user_sentiment_end",        "Sentiment at End",         0.6),
    ("sentiment_net_change",      "Sentiment Improvement",    0.4),
    ("handoff_needed",            "No Handoff Needed",        None),   # 0 = good
    ("social_media_threat",       "No Social Media Threat",   None),   # 0 = good
    ("agent_response_repetition", "No Repetitive Responses",  None),   # 1 = good (no repeats)
    ("unanswered_question_count", "All Questions Answered",   None),   # 0 = good
]

# Human-readable notes per metric
_METRIC_NOTES = {
    "handoff_needed":            "Bot handled without escalation",
    "social_media_threat":       "No social media escalation risk",
    "agent_response_repetition": "Bot responses were varied",
    "unanswered_question_count": "All merchant questions addressed",
}


def _classify_metric(key: str, value: float, threshold) -> bool:
    """Return True if the metric value is considered good."""
    if threshold is None:
        # Special binary metrics
        if key == "agent_response_repetition":
            return value >= 1.0   # 1 = no repetition (good)
        return value == 0.0       # 0 = good (handoff_needed, social_media_threat, unanswered_question_count)
    return value >= threshold


def fetch_eval(ticket_id: str, helpdesk_type: str = "merchant") -> Optional[Dict[str, Any]]:
    """
    Fetch eval score and categorised metrics for a given ticket_id.
    Returns an EvalResponse-compatible dict, or None if no data found.
    """
    schema     = DB_SCHEMA.get(helpdesk_type, "mhd_crm_cst")
    eval_table = EVAL_TABLE_TMPL.format(schema=schema)
    conn = _connect()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT eval_score, metrics_json
        FROM {eval_table}
        WHERE ticket_id = '{ticket_id}'
          AND dl_last_updated >= DATE '2025-01-01'
        LIMIT 1
    """)

    row = cur.fetchone()
    if not row:
        return None

    eval_score_raw, metrics_json_raw = row

    # Parse eval_score
    try:
        eval_score = float(eval_score_raw) if eval_score_raw is not None else None
    except (TypeError, ValueError):
        eval_score = None

    # Parse metrics JSON
    raw_metrics: Dict[str, Any] = {}
    try:
        if metrics_json_raw:
            parsed = _json.loads(metrics_json_raw)
            # metrics may be nested under "metrics" key
            raw_metrics = parsed.get("metrics", parsed) if isinstance(parsed, dict) else {}
            # if eval_score not set, try to get from parsed
            if eval_score is None:
                eval_score = parsed.get("eval_score")
    except Exception:
        pass

    went_right = []
    went_wrong = []

    for key, label, threshold in _EVAL_METRICS:
        if key not in raw_metrics:
            continue
        try:
            val = float(raw_metrics[key])
        except (TypeError, ValueError):
            continue

        # Format display value as percentage for 0-1 scores, integer otherwise
        if threshold is None and val in (0.0, 1.0):
            display_val = val
        else:
            display_val = round(val, 3)

        note = _METRIC_NOTES.get(key)
        item = {"key": key, "label": label, "value": display_val, "note": note}

        if _classify_metric(key, val, threshold):
            went_right.append(item)
        else:
            went_wrong.append(item)

    return {
        "ticket_id":   ticket_id,
        "eval_score":  round(eval_score, 3) if eval_score is not None else None,
        "went_right":  went_right,
        "went_wrong":  went_wrong,
        "raw_metrics": raw_metrics,
    }


# ── Session lookup ─────────────────────────────────────────────────────────────

def fetch_session_lookup(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Look up a single session by ticket_id across both merchant and customer schemas.
    Returns a dict with summary fields, or None if not found.
    """
    conn = _connect()
    cur = conn.cursor()

    for helpdesk_type, schema in DB_SCHEMA.items():
        table = f"hive.{schema}.feedback_complete_analyzed_data_snapshot_v3"
        try:
            cur.execute(f"""
                SELECT ticket_id, cst_entity, out_key_problem_desc, out_key_problem_sub_desc,
                       out_merchant_tone, dl_last_updated
                FROM {table}
                WHERE ticket_id = '{session_id}'
                  AND dl_last_updated >= DATE '2025-01-01'
                LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                ticket_id, cst_entity, issue, summary, tone, date_val = row
                date_str = date_val.isoformat() if hasattr(date_val, "isoformat") else str(date_val) if date_val else None
                return {
                    "session_id":    ticket_id,
                    "cst_entity":    cst_entity,
                    "issue":         issue,
                    "summary":       summary,
                    "tone":          (tone or "").lower(),
                    "date":          date_str,
                    "helpdesk_type": helpdesk_type,
                }
        except Exception:
            continue

    # Also check master data tables for sessions not in the main snapshot
    for helpdesk_type, schema in DB_SCHEMA.items():
        analytics_table = ANALYTICS_TABLE_TMPL.format(schema=schema)
        try:
            cur.execute(f"""
                SELECT ticket_id, cst_entity, intent, created_at
                FROM {analytics_table}
                WHERE ticket_id = '{session_id}'
                  AND dl_last_updated >= DATE '2025-01-01'
                LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                ticket_id, cst_entity, intent, created_at = row
                date_str = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at) if created_at else None
                return {
                    "session_id":    ticket_id,
                    "cst_entity":    cst_entity,
                    "issue":         intent,
                    "summary":       None,
                    "tone":          None,
                    "date":          date_str,
                    "helpdesk_type": helpdesk_type,
                }
        except Exception:
            continue

    return None


def fetch_sessions_by_mid(mid: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Fetch recent sessions for a given Merchant ID.
    Joins support_ticket_details with feedback snapshot for category/tone.
    Returns list of session dicts ordered by created_at desc.
    """
    conn = _connect()
    cur  = conn.cursor()
    results = []

    for helpdesk_type, schema in DB_SCHEMA.items():
        std_table = f"hive.{schema}.support_ticket_details_snapshot_v3"
        fb_table  = f"hive.{schema}.feedback_complete_analyzed_data_snapshot_v3"
        try:
            cur.execute(f"""
                SELECT
                    s.id AS session_id,
                    s.cst_entity,
                    s.created_at,
                    s.issue_category_l1,
                    s.issue_category_l2,
                    f.out_key_problem_desc,
                    f.out_key_problem_sub_desc,
                    f.out_merchant_tone
                FROM {std_table} s
                LEFT JOIN {fb_table} f
                    ON f.ticket_id = s.id
                    AND f.dl_last_updated >= DATE '2025-01-01'
                WHERE s.merchant_id = '{mid}'
                  AND s.dl_last_updated >= DATE '2025-01-01'
                ORDER BY s.created_at DESC
                LIMIT {limit}
            """)
            for row in cur.fetchall():
                session_id, entity, created_at, l1, l2, ai_l1, ai_l2, tone = row
                results.append({
                    "session_id":    session_id,
                    "cst_entity":    entity,
                    "created_at":    created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
                    "issue_l1":      ai_l1 or l1,
                    "issue_l2":      ai_l2 or l2,
                    "tone":          (tone or "").lower(),
                    "helpdesk_type": helpdesk_type,
                })
            if results:
                break
        except Exception:
            continue

    return results
