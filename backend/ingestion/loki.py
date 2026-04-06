"""
Loki MCP client for fetching session debug logs.

Calls the Loki MCP JSON-RPC server (cst-loki-mcp-debugging.paytm.com)
to retrieve and parse structured session event logs into a timeline.
"""

import os
import re
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

LOKI_MCP_URL_MERCHANT = os.getenv(
    "LOKI_MCP_URL_MERCHANT",
    "https://cst-loki-mcp-debugging.paytm.com/mcp/protocol",
)
LOKI_MCP_URL_CUSTOMER = os.getenv(
    "LOKI_MCP_URL_CUSTOMER",
    "https://ocl-cst-loki-mcp-debugging.paytm.com/mcp",
)

# ── MCP RPC helper ────────────────────────────────────────────────────────────

def _mcp_call(tool_name: str, arguments: Dict[str, Any], helpdesk_type: str = "merchant") -> Any:
    url = LOKI_MCP_URL_CUSTOMER if helpdesk_type == "customer" else LOKI_MCP_URL_MERCHANT
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
        "id": 1,
    }
    try:
        resp = requests.post(url, json=payload, timeout=180)
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise ValueError("Loki MCP timed out. The log server is slow — please try again.")
    except requests.exceptions.ConnectionError as e:
        raise ValueError(f"Loki MCP server error: {e}")
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code in (502, 503, 504):
            raise ValueError(f"Loki MCP gateway error ({e.response.status_code}). Please try again.")
        raise
    data = resp.json()

    # Standard JSON-RPC envelope: {"jsonrpc":"2.0","result":{...}}
    if isinstance(data, dict):
        if "error" in data:
            raise RuntimeError(f"MCP error: {data['error']}")
        return data.get("result", {})

    # Some endpoints return a bare array of content blocks directly
    if isinstance(data, list):
        return {"content": data}

    return data


# ── Log line parsers ──────────────────────────────────────────────────────────

_TS_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)"
)
_LEVEL_RE  = re.compile(r"\b(INFO|WARN|WARNING|ERROR|DEBUG|FATAL)\b", re.I)
_KV_RE     = re.compile(r'(\w+)=("(?:[^"\\]|\\.)*"|\S+)')


def _parse_ts(ts_str: str) -> Optional[str]:
    """Return ISO timestamp or None if unparseable."""
    if not ts_str:
        return None
    ts_str = ts_str.rstrip("Z")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(ts_str, fmt).isoformat() + "Z"
        except ValueError:
            continue
    return ts_str


def _unwrap_mcp_content(result: Any) -> Any:
    """
    MCP tools/call responses wrap their output in:
      {"content": [{"type": "text", "text": "..."}, ...]}

    Two cases:
    1. Single text block containing JSON → parse and return the JSON dict/list
    2. Multiple text blocks (one per log line) → return as a list of strings
    """
    if not isinstance(result, dict):
        return result

    content = result.get("content")
    if not isinstance(content, list) or not content:
        return result

    # Collect all text blocks
    text_blocks = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text_blocks.append(item.get("text", ""))
        elif isinstance(item, str):
            text_blocks.append(item)

    if not text_blocks:
        return result

    if len(text_blocks) == 1:
        # Single block — try to parse as JSON
        single = text_blocks[0].strip()
        try:
            return json.loads(single)
        except (json.JSONDecodeError, ValueError):
            return single
    else:
        # Multiple blocks — each is likely a log line
        # But first check if first block is a JSON status envelope
        try:
            first = json.loads(text_blocks[0].strip())
            if isinstance(first, dict) and "status" in first:
                return first   # Status envelope, let caller handle it
        except (json.JSONDecodeError, ValueError):
            pass
        return text_blocks  # Return as list of log line strings


def _check_for_mcp_error(text: str) -> None:
    """Raise ValueError if the text looks like an MCP/server error rather than log data."""
    stripped = text.strip()
    # Python traceback
    if "Traceback (most recent call last)" in stripped:
        # Extract the final exception line for a clean message
        lines = stripped.splitlines()
        last = next((l.strip() for l in reversed(lines) if l.strip()), stripped[-200:])
        raise ValueError(f"Loki MCP server error: {last}")
    # JSON error envelope
    try:
        obj = json.loads(stripped)
        if isinstance(obj, dict):
            err = obj.get("error") or obj.get("exception") or obj.get("detail")
            if err:
                msg = err if isinstance(err, str) else json.dumps(err)[:300]
                raise ValueError(f"Loki MCP error: {msg}")
    except (json.JSONDecodeError, ValueError) as e:
        if "Loki MCP" in str(e):
            raise


def _extract_log_lines(result: Any) -> List[str]:
    """Pull raw log lines from the (already-unwrapped) MCP tool response."""
    # Unwrap MCP content blocks first
    result = _unwrap_mcp_content(result)

    if isinstance(result, str):
        _check_for_mcp_error(result)
        return result.splitlines()

    if isinstance(result, list):
        lines = []
        for item in result:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text", "")
                _check_for_mcp_error(text)
                lines.extend(text.splitlines())
            elif isinstance(item, str):
                _check_for_mcp_error(item)
                lines.extend(item.splitlines() if "\n" in item else [item])
            else:
                lines.append(json.dumps(item))
        return lines

    if isinstance(result, dict):
        # Check for server-side traceback (error may be empty string but traceback present)
        tb = result.get("traceback", "")
        if tb and "Traceback" in tb:
            lines = tb.splitlines()
            last = next((l.strip() for l in reversed(lines) if l.strip()), "")
            raise ValueError(f"Loki MCP server error: {last}")

        # Check for "not found" status
        status = result.get("status", "")
        if status in ("not_found", "error"):
            root_cause = result.get("rootCause") or result.get("message") or "Session not found in Plug logs."
            raise ValueError(root_cause)

        # Extract log lines from common fields
        for key in ("logs", "lines", "events", "output", "data"):
            val = result.get(key)
            if isinstance(val, list):
                out = []
                for item in val:
                    out.append(item if isinstance(item, str) else json.dumps(item))
                return out
            if isinstance(val, str):
                return val.splitlines()

        # Fall back: serialise the whole dict as one "event"
        return [json.dumps(result)]

    return []


# ── Event classification ──────────────────────────────────────────────────────

_EVENT_PATTERNS = [
    # (regex, event_type, phase, icon)
    (re.compile(r"session.*(start|init|creat|open)", re.I),      "session_start",   "Session",       "🟢"),
    (re.compile(r"session.*(end|clos|terminat|finish)", re.I),    "session_end",     "Session",       "🔴"),
    (re.compile(r"workflow.*(call|start|invok|trigger)", re.I),   "workflow",        "Workflow",      "⚙️"),
    (re.compile(r"(master.?data|masterdata|GetMerchant|GetWallet|GetLoan)", re.I), "master_data", "Workflow", "📋"),
    (re.compile(r"(transformer|nlp|nlu|intent.detect)", re.I),    "transformer",     "NLU",           "🧠"),
    (re.compile(r"intent.*(detect|classif|identif|found)", re.I), "intent",          "NLU",           "🎯"),
    (re.compile(r"(user.?(query|message|input|say|said)|merchant.?(query|msg))", re.I), "user_message", "User", "💬"),
    (re.compile(r"(bot.?(respond|reply|send|say)|response.?sent)", re.I), "bot_response", "Bot",      "🤖"),
    (re.compile(r"(function.?call|tool.?call|api.?call|CheckLoan|GetStatus|FetchData)", re.I), "function_call", "Function Call", "🔧"),
    (re.compile(r"(function|tool|api).*(result|return|output|response)", re.I), "function_result", "Function Call", "📤"),
    (re.compile(r"(greeting|welcome|namaskar|hello|hii)", re.I),  "greeting",        "Bot",           "👋"),
    (re.compile(r"(handoff|escalat|transfer.?human|human.?agent)", re.I), "handoff",  "Escalation",   "🚨"),
    (re.compile(r"\b(error|exception|fail|crash)\b", re.I),       "error",           "Error",         "❌"),
    (re.compile(r"\b(warn|warning)\b", re.I),                     "warning",         "Warning",       "⚠️"),
]

_PHASE_ORDER = ["Session", "Workflow", "NLU", "User", "Bot", "Function Call", "Escalation", "Error", "Warning", "Other"]


def _classify_line(line: str) -> Dict[str, Any]:
    """Parse one log line into a structured event dict."""
    # Try JSON first
    parsed_json = None
    stripped = line.strip()
    if stripped.startswith("{"):
        try:
            parsed_json = json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            pass

    if parsed_json:
        ts_raw  = (parsed_json.get("timestamp") or parsed_json.get("ts") or
                   parsed_json.get("time") or parsed_json.get("@timestamp") or "")
        level   = (parsed_json.get("level") or parsed_json.get("severity") or "INFO").upper()
        message = (parsed_json.get("message") or parsed_json.get("msg") or
                   parsed_json.get("log") or "")
        extra   = {k: v for k, v in parsed_json.items()
                   if k not in {"timestamp","ts","time","@timestamp","level","severity","message","msg","log"}}
    else:
        # Parse structured text log
        ts_match  = _TS_RE.search(stripped)
        ts_raw    = ts_match.group(1) if ts_match else ""
        lvl_match = _LEVEL_RE.search(stripped)
        level     = lvl_match.group(1).upper() if lvl_match else "INFO"

        # Remove timestamp + level prefix to get message
        msg_text = stripped
        if ts_raw:
            msg_text = msg_text.replace(ts_raw, "").strip()
        if lvl_match:
            msg_text = re.sub(r'\b' + re.escape(lvl_match.group(1)) + r'\b', "", msg_text, count=1, flags=re.I).strip()
        msg_text = re.sub(r'^\W+', '', msg_text)

        # Extract key=value pairs as extra
        extra = {}
        for k, v in _KV_RE.findall(stripped):
            if k not in ("timestamp","ts","time","level"):
                extra[k] = v.strip('"')

        # Use remaining text as message
        clean = _KV_RE.sub("", msg_text).strip(" |[]:-")
        message = clean or stripped[:200]

    # Classify event type
    event_type = "info"
    phase      = "Other"
    icon       = "ℹ️"
    for pattern, etype, ephase, eicon in _EVENT_PATTERNS:
        if pattern.search(message) or pattern.search(str(extra)):
            event_type = etype
            phase      = ephase
            icon       = eicon
            break

    if event_type == "info" and level in ("ERROR", "FATAL"):
        event_type, phase, icon = "error", "Error", "❌"
    elif event_type == "info" and level in ("WARN", "WARNING"):
        event_type, phase, icon = "warning", "Warning", "⚠️"

    return {
        "timestamp": _parse_ts(ts_raw),
        "level":     level,
        "type":      event_type,
        "phase":     phase,
        "icon":      icon,
        "message":   message,
        "raw":       stripped,
        "meta":      extra,
    }


def _build_timeline(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort events by timestamp, deduplicate exact duplicates."""
    seen = set()
    unique = []
    for e in events:
        key = (e.get("timestamp"), e.get("message", "")[:80])
        if key not in seen:
            seen.add(key)
            unique.append(e)

    # Sort by timestamp (nulls last)
    unique.sort(key=lambda e: e.get("timestamp") or "9999")

    # Add relative time offset from first timestamped event
    base_ts = None
    for e in unique:
        if e.get("timestamp"):
            try:
                base_ts = datetime.fromisoformat(e["timestamp"].rstrip("Z"))
                break
            except ValueError:
                pass

    for e in unique:
        if base_ts and e.get("timestamp"):
            try:
                t = datetime.fromisoformat(e["timestamp"].rstrip("Z"))
                delta_ms = int((t - base_ts).total_seconds() * 1000)
                e["offset_ms"] = delta_ms
            except ValueError:
                e["offset_ms"] = None
        else:
            e["offset_ms"] = None

    return unique


# ── Public API ────────────────────────────────────────────────────────────────

def _session_date_from_trino(session_id: str, helpdesk_type: Optional[str] = None):
    """
    Try to find the session's date in Trino so we can build a sensible Loki window.
    Returns (start_ist, end_ist, detected_helpdesk_type) or (None, None, None).
    If helpdesk_type is provided, only that schema is checked; otherwise both are tried.
    """
    schema_map = {"merchant": "mhd_crm_cst", "customer": "crm_cst"}
    if helpdesk_type and helpdesk_type in schema_map:
        schemas = [(helpdesk_type, schema_map[helpdesk_type])]
    else:
        schemas = [("merchant", "mhd_crm_cst"), ("customer", "crm_cst")]

    try:
        import sys, os as _os
        sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
        from ingestion.trino_helpdesk import _connect
        conn = _connect()
        cur  = conn.cursor()
        for htype, schema in schemas:
            try:
                cur.execute(f"""
                    SELECT created_at
                    FROM hive.{schema}.support_ticket_details_snapshot_v3
                    WHERE id = '{session_id}'
                      AND dl_last_updated >= DATE '2025-01-01'
                    LIMIT 1
                """)
                row = cur.fetchone()
                if row and row[0]:
                    raw = row[0]
                    # support_ticket_details_snapshot_v3 stores created_at in IST already
                    ist_dt = raw if isinstance(raw, datetime) else datetime.fromisoformat(str(raw)[:19])
                    start = ist_dt - timedelta(minutes=1)
                    end   = ist_dt + timedelta(minutes=1)
                    print(f"DEBUG _session_date_from_trino: session={session_id} ist={ist_dt} window={start} to {end}")
                    return (
                        f"{start.strftime('%Y-%m-%d')}T{start.strftime('%H:%M:%S')}",
                        f"{end.strftime('%Y-%m-%d')}T{end.strftime('%H:%M:%S')}",
                        htype,
                    )
            except Exception as e:
                print(f"DEBUG _session_date_from_trino [{schema}] error: {e}")
                continue
    except Exception:
        pass
    return None, None, None


def _fetch_from_loki(
    session_id: str,
    start_time: str,
    end_time:   str,
    helpdesk_type: str,
) -> List[Dict[str, Any]]:
    """
    Core Loki fetch: AggregateFailureDebug → traceId → AnalyzePlugWorkflow.
    Raises ValueError if session not found or no log lines returned.
    """
    # start_time/end_time are already IST strings from the frontend.
    # Loki requires start_hms < end_hms (no cross-midnight).
    # If the window crosses midnight, use end_time's date and clamp start to 00:00.
    start_hms = start_time[11:19]
    end_hms   = end_time[11:19]
    if start_hms > end_hms:
        # Window crosses midnight — session is in early hours of end_time's date
        date_part = end_time[:10]
        start_hms = "00:00:00"
    else:
        date_part = start_time[:10]

    # Step 1: get traceId
    agg_result = _mcp_call(
        "AggregateFailureDebug",
        {
            "session_id": session_id,
            "date":        date_part,
            "start_time":  start_hms,
            "end_time":    end_hms,
        },
        helpdesk_type=helpdesk_type,
    )

    agg_data = _unwrap_mcp_content(agg_result)
    if isinstance(agg_data, str):
        try:
            agg_data = json.loads(agg_data)
        except (json.JSONDecodeError, ValueError):
            agg_data = {}

    if isinstance(agg_data, dict):
        status = agg_data.get("status", "")
        if status in ("not_found", "error"):
            root_cause = (agg_data.get("rootCause") or
                          agg_data.get("message") or
                          "Session not found in Plug logs.")
            raise ValueError(root_cause)

    trace_id = agg_data.get("traceId") if isinstance(agg_data, dict) else None
    if not trace_id:
        raise ValueError("No traceId found for provided sessionId in Plug logs.")

    # Step 2: fetch log lines
    log_result = _mcp_call(
        "AnalyzePlugWorkflow",
        {
            "term":       trace_id,
            "date":       date_part,
            "start_time": start_hms,
            "end_time":   end_hms,
            "limit":      500,
        },
        helpdesk_type=helpdesk_type,
    )

    log_data = _unwrap_mcp_content(log_result)
    if isinstance(log_data, str):
        try:
            log_data = json.loads(log_data)
        except (json.JSONDecodeError, ValueError):
            pass

    raw_lines: List[str] = []

    if isinstance(log_data, dict):
        rll = log_data.get("raw_log_lines")
        if isinstance(rll, list) and rll:
            for item in rll:
                if isinstance(item, dict):
                    raw_lines.append(item.get("log") or json.dumps(item))
                elif isinstance(item, str):
                    raw_lines.append(item)
        elif log_data.get("narrative"):
            narrative = log_data["narrative"]
            for line in narrative.splitlines():
                line = re.sub(r'^\[\d+\]\s*', '', line).strip()
                if line:
                    raw_lines.append(line)
    elif isinstance(log_data, list):
        raw_lines = _extract_log_lines(log_data)
    else:
        raw_lines = _extract_log_lines(log_result)

    if not raw_lines:
        raise ValueError("No log lines returned for this session.")

    events = [_classify_line(line) for line in raw_lines if line.strip()]
    return _build_timeline(events)


def _fetch_from_opensip(
    session_id: str,
    date_part:  str,
    start_hms:  str,
    end_hms:    str,
) -> List[Dict[str, Any]]:
    """
    Search OpenSIP logs (merchant endpoint only) for AI IVR / outbound sessions.
    Raises ValueError if nothing found.
    """
    result = _mcp_call(
        "SearchOpenSipLogs",
        {
            "term":       session_id,
            "date":       date_part,
            "start_time": start_hms,
            "end_time":   end_hms,
            "limit":      200,
        },
        helpdesk_type="merchant",
    )

    data = _unwrap_mcp_content(result)
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (json.JSONDecodeError, ValueError):
            pass

    raw_lines: List[str] = []

    if isinstance(data, dict):
        lines = data.get("lines") or data.get("raw_log_lines") or []
        for item in lines:
            if isinstance(item, dict):
                raw_lines.append(item.get("log") or json.dumps(item))
            elif isinstance(item, str):
                raw_lines.append(item)
        if not raw_lines and data.get("narrative"):
            for line in data["narrative"].splitlines():
                line = re.sub(r'^\[\d+\]\s*', '', line).strip()
                if line:
                    raw_lines.append(line)
    elif isinstance(data, list):
        raw_lines = _extract_log_lines(data)

    if not raw_lines:
        raise ValueError("No OpenSIP logs found for this session.")

    events = [_classify_line(line) for line in raw_lines if line.strip()]
    return _build_timeline(events)


def fetch_session_timeline(
    session_id:    str,
    start_time:    Optional[str] = None,   # IST "YYYY-MM-DDTHH:MM:SS"
    end_time:      Optional[str] = None,
    helpdesk_type: str = "merchant",
) -> List[Dict[str, Any]]:
    """
    Fetch Loki logs for a session and return structured timeline events.

    Times must be in IST (UTC+5:30) as expected by the Loki MCP.
    If not provided, tries Trino to find the session date, then falls back to last 24h.
    helpdesk_type selects the primary Loki MCP endpoint; automatically falls back
    to the other endpoint if the session is not found on the first try.
    """
    if not start_time or not end_time:
        start_time, end_time, detected_type = _session_date_from_trino(session_id, helpdesk_type)
        if detected_type:
            helpdesk_type = detected_type

    if not start_time or not end_time:
        now_ist    = datetime.utcnow() + timedelta(hours=5, minutes=30)
        end_time   = now_ist.strftime("%Y-%m-%dT23:59:59")
        start_time = (now_ist - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")

    print(f"DEBUG loki fetch_session_timeline: session={session_id} helpdesk={helpdesk_type} start={start_time} end={end_time}")

    # Try primary endpoint; retry once on server crash, then fallback to other endpoint
    fallback_type = "customer" if helpdesk_type == "merchant" else "merchant"
    try:
        try:
            return _fetch_from_loki(session_id, start_time, end_time, helpdesk_type)
        except ValueError as retry_err:
            if "server error" in str(retry_err).lower():
                return _fetch_from_loki(session_id, start_time, end_time, helpdesk_type)
            raise
    except ValueError as primary_err:
        err_str = str(primary_err)
        if any(kw in err_str.lower() for kw in ("not found", "no traceid", "server error")):
            # Try other Plug/AI endpoint
            try:
                return _fetch_from_loki(session_id, start_time, end_time, fallback_type)
            except ValueError as fallback_err:
                pass  # fall through to OpenSIP

            # Try OpenSIP (merchant endpoint, for AI IVR / outbound campaign sessions)
            try:
                start_hms = start_time[11:19]
                end_hms   = end_time[11:19]
                if start_hms > end_hms:
                    date_part = end_time[:10]
                    start_hms = "00:00:00"
                else:
                    date_part = start_time[:10]
                return _fetch_from_opensip(session_id, date_part, start_hms, end_hms)
            except ValueError:
                pass

            raise ValueError("No traceId found for provided sessionId in Plug logs.") from None
        raise


# ── Message prompt fetch ──────────────────────────────────────────────────────

def fetch_message_prompt(
    session_id:     str,
    created_at_utc: str,          # ISO string from DB, e.g. "2026-03-28T18:49:31"
    helpdesk_type:  str = "merchant",
    entity:         Optional[str] = None,  # CstEntity from meta.expTag, e.g. "p4bpayoutandsettlement"
    message_type:   str = "message",       # "function_call" or "message"
) -> Dict[str, Any]:
    """
    Fetch the raw LLM prompt that generated a specific bot message or tool call.

    Strategy:
      1. Convert created_at_utc → IST, build a tight window
         - bot response:   −5s to +1s  (LLM logs just before message stored)
         - function_call:  −6s to −1s  (LLM that generated the tool call MUST complete
                                         before the function_call row is written; a concurrent
                                         LLM call for a new user message may log at T+0,
                                         so we exclude the last second to avoid that noise)
      2. Call SearchAILogs with session_id to get AI-service log lines
      3. Find "Final prompt" log lines; filter by CstEntity if provided
      4. Pick the line whose timestamp is closest to created_at_utc
      5. Extract the Prompt: field (everything after "Prompt: ")

    Returns dict with keys: prompt, model, prompt_name, trace_id, span_id, log_time
    """
    # 1. Build IST window.
    # Trino returns created_at in UTC. Convert to IST for SearchAILogs (which uses IST date/time).
    try:
        utc_dt = datetime.fromisoformat(created_at_utc.replace("Z", ""))
    except Exception:
        utc_dt = datetime.utcnow()

    ist_dt = utc_dt + timedelta(hours=5, minutes=30)
    if message_type == "function_call":
        # The LLM that generates a function_call completes ≥1s before the row is stored.
        # A concurrent LLM call (e.g. processing a new user message arriving at the same second)
        # would log at T+0 — we use T as the end (exclusive on most Loki implementations)
        # so that the concurrent call at T is excluded while T-1s is included.
        start_dt = ist_dt - timedelta(seconds=6)
        end_dt   = ist_dt   # exclusive end excludes the concurrent call at this exact second
    else:
        start_dt = ist_dt - timedelta(seconds=5)
        end_dt   = ist_dt + timedelta(seconds=1)

    date_part = ist_dt.strftime("%Y-%m-%d")
    start_hms = start_dt.strftime("%H:%M:%S")
    end_hms   = end_dt.strftime("%H:%M:%S")

    # If window crosses midnight, clamp start to 00:00:00 on end_dt's date
    if start_dt.date() != end_dt.date():
        date_part = end_dt.strftime("%Y-%m-%d")
        start_hms = "00:00:00"

    print(f"DEBUG fetch_message_prompt: session={session_id} created_at_utc={created_at_utc!r} ist_dt={ist_dt} window={date_part} {start_hms}-{end_hms} entity={entity!r}")

    # 2. Call SearchAILogs
    result = _mcp_call(
        "SearchAILogs",
        {
            "term":       session_id,
            "date":       date_part,
            "start_time": start_hms,
            "end_time":   end_hms,
            "limit":      200,
        },
        helpdesk_type=helpdesk_type,
    )

    lines = _extract_log_lines(result)

    # 3. Find "Final prompt" lines, scoped to session + entity where possible
    def _is_prompt_line(l: str) -> bool:
        return "getChatStream" in l and "Final prompt" in l

    def _matches_entity(l: str) -> bool:
        if not entity:
            return True
        return f"CstEntity: {entity}" in l or f"CstEntity:{entity}" in l

    # Strict: session + entity
    prompt_lines = [
        l for l in lines
        if _is_prompt_line(l) and f"session:{session_id}" in l and _matches_entity(l)
    ]
    # Relax entity filter if no match
    if not prompt_lines:
        prompt_lines = [
            l for l in lines
            if _is_prompt_line(l) and f"session:{session_id}" in l
        ]
    # Relax session filter if still no match
    if not prompt_lines:
        prompt_lines = [l for l in lines if _is_prompt_line(l) and _matches_entity(l)]
    if not prompt_lines:
        prompt_lines = [l for l in lines if _is_prompt_line(l)]

    print(f"DEBUG fetch_message_prompt: total lines={len(lines)}, prompt_lines={len(prompt_lines)}")
    for pl in prompt_lines:
        pname = re.search(r'PromptName:\s*([^,\s]+)', pl)
        cent  = re.search(r'CstEntity:\s*([^,\s]+)', pl)
        pts   = _TS_RE.search(pl)
        print(f"  prompt_line ts={pts.group(1) if pts else 'NONE'} PromptName={pname.group(1) if pname else '?'} CstEntity={cent.group(1) if cent else '?'}")

    if not prompt_lines:
        raise ValueError(
            "No 'Final prompt' log line found in the SearchAILogs window. "
            "The prompt may be outside the search window or the session uses a different log format."
        )

    # 4. Pick the line whose log timestamp is closest to created_at_utc.
    #    Log timestamps are UTC; created_at_utc is also UTC — compare directly.
    def _parse_log_ts(line: str) -> Optional[datetime]:
        m = _TS_RE.search(line)
        if m:
            ts = m.group(1).rstrip("Z")
            for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
                        "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(ts, fmt)
                except ValueError:
                    continue
        return None

    def _ts_delta(line: str) -> float:
        log_dt = _parse_log_ts(line)
        if log_dt is None:
            return float("inf")
        return abs((log_dt - utc_dt).total_seconds())

    for pl in prompt_lines:
        print(f"  ts_delta={_ts_delta(pl):.1f}s for log_dt={_parse_log_ts(pl)} vs utc_dt={utc_dt}")
    log_line = min(prompt_lines, key=_ts_delta)

    # 4. Extract metadata and Prompt field
    # Log format: "... trace:X span:Y ... - [TruFoundryChatCompletion] Final prompt - Model: M, PromptName: P, CstEntity: E, Prompt: <raw>"
    def _extract_kv(pattern: str, text: str) -> Optional[str]:
        m = re.search(pattern, text)
        return m.group(1).strip() if m else None

    trace_id    = _extract_kv(r'\btrace:(\S+)',      log_line)
    span_id     = _extract_kv(r'\bspan:(\S+)',       log_line)
    model_raw   = _extract_kv(r'Model:\s*([^,]+)',   log_line)
    prompt_name = _extract_kv(r'PromptName:\s*([^,]+)', log_line)

    # Extract log timestamp (first token)
    log_time: Optional[str] = None
    ts_m = _TS_RE.search(log_line)
    if ts_m:
        log_time = ts_m.group(1)

    # Extract Prompt: field — everything after "Prompt: "
    prompt_idx = log_line.find("Prompt: ")
    if prompt_idx == -1:
        raise ValueError("Log line found but 'Prompt: ' marker not present.")

    raw_prompt = log_line[prompt_idx + len("Prompt: "):]

    return {
        "prompt":      raw_prompt,
        "model":       model_raw,
        "prompt_name": prompt_name,
        "trace_id":    trace_id,
        "span_id":     span_id,
        "log_time":    log_time,
        "lines_found": len(prompt_lines),
    }


def fetch_session_all_prompts(
    session_id:    str,
    date:          str,           # IST date, e.g. "2026-03-29"
    helpdesk_type: str = "merchant",
) -> List[Dict[str, Any]]:
    """
    Return all 'Final prompt' log lines for a session on a given IST date.
    Used for diagnostics / prompt timeline inspection.
    """
    result = _mcp_call(
        "SearchAILogs",
        {"term": session_id, "date": date, "start_time": "00:00:00", "end_time": "23:59:59", "limit": 500},
        helpdesk_type=helpdesk_type,
    )
    lines = _extract_log_lines(result)
    out = []
    for l in lines:
        if "getChatStream" not in l or "Final prompt" not in l:
            continue
        ts_m    = _TS_RE.search(l)
        pname   = re.search(r'PromptName:\s*([^,\s]+)', l)
        cent    = re.search(r'CstEntity:\s*([^,\s]+)', l)
        model_m = re.search(r'Model:\s*([^,\s]+)', l)
        out.append({
            "log_time":    ts_m.group(1)   if ts_m    else None,
            "prompt_name": pname.group(1)  if pname   else None,
            "cst_entity":  cent.group(1)   if cent    else None,
            "model":       model_m.group(1) if model_m else None,
        })
    return out


# ── Plug tool-response fetch ──────────────────────────────────────────────────

def fetch_plug_tool_response(
    session_id:     str,
    tool_name:      str,            # e.g. "get_settlement_and_payment_information"
    created_at_utc: str,            # ISO string from DB, e.g. "2026-03-28T18:34:04"
    helpdesk_type:  str = "merchant",
    window_minutes: int = 15,
) -> Dict[str, Any]:
    """
    Fetch the raw Plug API response for a specific tool call from Loki.

    Strategy:
      1. Convert created_at_utc → IST, build ±window_minutes time window
      2. Search AnalyzePlugWorkflow by session_id directly (avoids AggregateFailureDebug
         returning the wrong traceId when multiple tool calls share a session)
      3. Filter lines that mention the specific tool name
      4. Extract the traceId from the matching line
    """
    # 1. Build IST window
    try:
        utc_dt = datetime.fromisoformat(created_at_utc.replace("Z", ""))
    except Exception:
        utc_dt = datetime.utcnow()

    ist_dt   = utc_dt + timedelta(hours=5, minutes=30)
    start_dt = ist_dt - timedelta(minutes=2)
    end_dt   = ist_dt + timedelta(minutes=window_minutes)

    date_part = ist_dt.strftime("%Y-%m-%d")
    start_hms = start_dt.strftime("%H:%M:%S")
    end_hms   = end_dt.strftime("%H:%M:%S")

    if start_dt.date() != end_dt.date():
        date_part = end_dt.strftime("%Y-%m-%d")
        start_hms = "00:00:00"

    print(f"DEBUG fetch_plug_tool_response: session={session_id} tool={tool_name} window={date_part} {start_hms}-{end_hms}")

    # 2. Fetch all Plug log lines by session_id directly
    log_result = _mcp_call(
        "AnalyzePlugWorkflow",
        {"term": session_id, "date": date_part, "start_time": start_hms, "end_time": end_hms, "limit": 500},
        helpdesk_type=helpdesk_type,
    )
    log_data = _unwrap_mcp_content(log_result)
    if isinstance(log_data, str):
        try:
            log_data = json.loads(log_data)
        except Exception:
            pass

    raw_lines: List[str] = []
    if isinstance(log_data, dict):
        rll = log_data.get("raw_log_lines")
        if isinstance(rll, list) and rll:
            for item in rll:
                if isinstance(item, dict):
                    raw_lines.append(item.get("log") or json.dumps(item))
                elif isinstance(item, str):
                    raw_lines.append(item)
        elif log_data.get("narrative"):
            for line in log_data["narrative"].splitlines():
                line = re.sub(r'^\[\d+\]\s*', '', line).strip()
                if line:
                    raw_lines.append(line)
    elif isinstance(log_data, list):
        raw_lines = _extract_log_lines(log_data)

    if not raw_lines:
        raise ValueError("No Plug log lines returned for this session.")

    # 3. Match only on the log PREFIX (before the JSON payload `{`), not inside the JSON body.
    #    The workflow name appears in ApiTransformerServiceImpl lines as:
    #    "...Modified workflow response for workflow ACPS_get_deductions_information: {...}"
    #    Request Headers/Body lines share the same traceId+timestamp as the ServiceImpl line.

    workflow_tag = f"acps_{tool_name}".lower()  # e.g. "acps_get_deductions_information"

    def _prefix_has_workflow(line: str) -> bool:
        brace_idx = line.find('{')
        prefix = line[:brace_idx].lower() if brace_idx > 0 else line.lower()
        return workflow_tag.replace("_", "") in prefix.replace("_", "")

    def _line_key(line: str):
        """(traceId, HH:MM:SS) uniquely identifies a Plug request."""
        trace_m = re.search(r'\[traceId=([^\]]+)\]', line)
        ts_m    = re.match(r'^\d{4}-\d{2}-\d{2} (\d{2}:\d{2}:\d{2})', line)
        if trace_m and ts_m:
            return (trace_m.group(1), ts_m.group(1))
        return None

    # Step A: find ServiceImpl lines whose PREFIX names the exact workflow,
    #         filtered to within ±2 seconds of the actual tool call timestamp.
    #         Both DB created_at and Loki log timestamps are UTC, so we compare directly.
    def _log_ts(line: str):
        """Parse the UTC datetime from a Loki log line prefix."""
        m = re.match(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
        if m:
            try:
                return datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
        return None

    anchor_keys: set = set()
    trace_id = None
    for line in raw_lines:
        if not _prefix_has_workflow(line):
            continue
        log_dt = _log_ts(line)
        # Accept if within ±2 seconds of the tool call, or if we have no timestamp
        if log_dt is not None and abs((log_dt - utc_dt).total_seconds()) > 2:
            continue
        key = _line_key(line)
        if key:
            anchor_keys.add(key)
            if trace_id is None:
                trace_id = key[0]

    # Step B: include all lines (Request Headers, Request Body, etc.) that share
    #         the same traceId+timestamp as an anchor line
    if anchor_keys:
        matching = [l for l in raw_lines if _line_key(l) in anchor_keys]
    else:
        # No exact workflow match — fall back to loose tool-name search in prefix only
        tool_norm = tool_name.lower().replace("_", "")
        matching = []
        for line in raw_lines:
            brace_idx = line.find('{')
            prefix = line[:brace_idx].lower() if brace_idx > 0 else line.lower()
            if tool_norm in prefix.replace("_", ""):
                matching.append(line)

    # Fallback traceId from any raw line
    if not trace_id:
        for line in raw_lines:
            m = re.search(r'\[traceId=([^\]]+)\]', line)
            if m:
                trace_id = m.group(1)
                break

    return {
        "trace_id":    trace_id or "unknown",
        "tool_name":   tool_name,
        "log_lines":   matching,
        "total_lines": len(raw_lines),
    }
