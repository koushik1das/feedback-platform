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

    Args:
        product:       product slug (e.g. "loan", "soundbox", "train", "flight")
        helpdesk_type: "merchant" or "customer"
        date_range:    one of last_7_days | last_30_days | yesterday | day_before_yesterday
    """
    entity_map = CUSTOMER_CST_ENTITY_MAP if helpdesk_type == "customer" else CST_ENTITY_MAP
    cst_entity = entity_map.get(product, product)
    schema     = DB_SCHEMA.get(helpdesk_type, "crm_cst")
    table      = f"hive.{schema}.feedback_complete_analyzed_data_snapshot_v3"
    conn = _connect()
    cur = conn.cursor()

    # Find the latest date that has completed analysis (started rows have no analysis fields)
    cur.execute(f"""
        SELECT MAX(dl_last_updated)
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND dl_last_updated >= DATE '2025-01-01'
          AND task_status = 'completed'
    """)
    max_date = cur.fetchone()[0]
    if max_date is None:
        raise ValueError(f"No data found for entity '{cst_entity}'.")

    since, until = _resolve_date_range(max_date, date_range)
    date_filter = f"dl_last_updated BETWEEN DATE '{since}' AND DATE '{until}'"

    # 1. Issues with tone breakdown (for avg sentiment per issue)
    cur.execute(f"""
        SELECT out_key_problem_desc, out_merchant_tone, COUNT(*) AS cnt
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND {date_filter}
          AND out_key_problem_desc IS NOT NULL
          AND out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
        GROUP BY out_key_problem_desc, out_merchant_tone
    """)
    issue_tone_rows = cur.fetchall()

    # 2. Total completed records
    cur.execute(f"""
        SELECT COUNT(*)
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND {date_filter}
    """)
    total = cur.fetchone()[0] or 0

    # 3. Overall tone distribution for sentiment summary
    cur.execute(f"""
        SELECT out_merchant_tone, COUNT(*) AS cnt
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND {date_filter}
        GROUP BY out_merchant_tone
    """)
    tone_rows = cur.fetchall()

    # 3b. Social media escalation threat
    cur.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN social_media_threat IN ('YES', 'हाँ', 'हां') THEN 1 ELSE 0 END) AS threat_count
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND {date_filter}
    """)
    threat_row = cur.fetchone()
    threat_total = threat_row[0] or 0
    threat_count = threat_row[1] or 0
    threat_pct = round(threat_count / threat_total * 100, 2) if threat_total > 0 else 0.0

    # 4. Sample comments per issue with ticket_id, tone, language, date
    cur.execute(f"""
        SELECT out_key_problem_desc, out_key_problem_sub_desc, ticket_id,
               out_merchant_tone, dl_last_updated
        FROM {table}
        WHERE cst_entity = '{cst_entity}'
          AND task_status = 'completed'
          AND {date_filter}
          AND out_key_problem_desc IS NOT NULL
          AND out_key_problem_desc NOT IN ('Others', 'NA', 'None', '')
          AND out_key_problem_sub_desc IS NOT NULL
          AND out_key_problem_sub_desc NOT IN ('Others', 'NA', 'None', '')
        LIMIT 2000
    """)
    comment_rows = cur.fetchall()

    # ── Aggregate issue data ──────────────────────────────────────────────────

    l1_data: Dict[str, Dict] = defaultdict(
        lambda: {"total": 0, "tone_counts": defaultdict(int)}
    )
    for l1, tone, cnt in issue_tone_rows:
        l1_data[l1]["total"] += cnt
        l1_data[l1]["tone_counts"][tone or "neutral"] += cnt

    # Pool sample comments per L1 — store (text, ticket_id, tone, lang, date) tuples
    comments_by_l1: Dict[str, List[tuple]] = defaultdict(list)
    for l1, comment, ticket_id, tone, row_date in comment_rows:
        if l1 and comment and len(comments_by_l1[l1]) < 10:
            date_str = str(row_date) if row_date else None
            comments_by_l1[l1].append((comment, ticket_id, tone, _detect_lang(comment), date_str))

    sorted_l1 = sorted(l1_data.items(), key=lambda x: x[1]["total"], reverse=True)

    top_issues = []
    for l1, data in sorted_l1[:10]:
        l1_total = data["total"]
        tone_counts = data["tone_counts"]
        weighted_sum = sum(TONE_SCORE.get(t, 0.0) * c for t, c in tone_counts.items())
        avg_score = weighted_sum / l1_total if l1_total else 0.0
        issue_comments = comments_by_l1.get(l1, [])
        top_issues.append({
            "label":              l1,
            "count":              l1_total,
            "percentage":         round(l1_total / total * 100, 1) if total else 0.0,
            "avg_sentiment":      round(avg_score, 2),
            "sentiment_label":    _score_to_label(avg_score),
            "example_comments":   [c[0] for c in issue_comments],
            "comment_ticket_ids": [c[1] for c in issue_comments],
            "comment_tones":      [c[2] for c in issue_comments],
            "comment_langs":      [c[3] for c in issue_comments],
            "comment_dates":      [c[4] for c in issue_comments],
            "comment_ratings":    [None  for c in issue_comments],
            "channels":           {"helpdesk": l1_total},
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

    top_label   = top_issues[0]["label"] if top_issues else "N/A"
    top_pct     = top_issues[0]["percentage"] if top_issues else 0
    neg_pct     = round(negative / total * 100, 1) if total else 0
    user_label  = "customers" if helpdesk_type == "customer" else "merchants"
    date_label  = since if since == until else f"{since} → {until}"
    ai_summary = (
        f"Analysed {total:,} helpdesk interactions for {cst_entity} "
        f"({date_label}). "
        f"Top complaint: '{top_label}' ({top_pct}% of tickets). "
        f"{neg_pct}% of {user_label} expressed frustration. "
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
