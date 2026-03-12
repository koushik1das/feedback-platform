"""
Trino direct-connection client.

Replaces the Superset MCP approach.  Connects to the Trino cluster via
trino.dbapi (the official Python driver) and fetches chatbot feedback rows
from the configured table.

Required environment variables:
  TRINO_USER        e.g. koushik1.das@paytm.com

Optional overrides (defaults shown):
  TRINO_HOST        cdp-dashboarding.platform.mypaytm.com
  TRINO_PORT        443
  TRINO_CATALOG     hive
  TRINO_SCHEMA      team_servicesone
  TRINO_TABLE       upi_ai_bot_summary_v3
  TRINO_FETCH_LIMIT 500
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

TRINO_HOST    = os.getenv("TRINO_HOST",    "cdp-trino-query.platform.mypaytm.com")
TRINO_PORT    = int(os.getenv("TRINO_PORT", "443"))
TRINO_CATALOG = os.getenv("TRINO_CATALOG", "hive")
TRINO_SCHEMA  = os.getenv("TRINO_SCHEMA",  "team_servicesone")
TRINO_TABLE   = os.getenv("TRINO_TABLE",   "upi_ai_bot_summary_v3")
TRINO_LIMIT   = int(os.getenv("TRINO_FETCH_LIMIT", "500"))

# Service account used for BasicAuthentication (separate from the query user)
TRINO_SERVICE_USER = os.getenv("TRINO_SERVICE_USER", "")
TRINO_SERVICE_PASS = os.getenv("TRINO_SERVICE_PASSWORD", "")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return datetime.utcnow()


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


# ── TrinoClient ───────────────────────────────────────────────────────────────

class TrinoClient:
    """
    Thin wrapper around trino.dbapi.

    Usage:
        client = TrinoClient.from_env()
        rows   = client.fetch_chatbot_feedback()
    """

    def __init__(self, host: str, port: int, user: str,
                 service_user: str = "", service_password: str = "",
                 catalog: str = TRINO_CATALOG):
        from trino.dbapi import connect
        from trino.auth import BasicAuthentication

        # Strip https:// prefix if accidentally included in host
        host = host.replace("https://", "").replace("http://", "").rstrip("/")

        kwargs = dict(
            host=host,
            port=port,
            user=user,
            catalog=catalog,
            http_scheme="https",
        )
        if service_user and service_password:
            kwargs["auth"] = BasicAuthentication(service_user, service_password)

        self._conn = connect(**kwargs)
        logger.info("TrinoClient connected to %s:%s as %s", host, port, user)

    # ── SQL execution ─────────────────────────────────────────────────────────

    def execute(self, sql: str) -> List[Dict[str, Any]]:
        """Run SQL and return a list of row dicts keyed by column name."""
        cursor = self._conn.cursor()
        try:
            logger.debug("Executing Trino SQL: %s", sql)
            cursor.execute(sql)
            rows = cursor.fetchall()
            cols = [desc[0] for desc in cursor.description]
            result = [dict(zip(cols, row)) for row in rows]
            logger.info("Trino returned %d rows", len(result))
            return result
        except Exception as exc:
            logger.error("Trino query failed: %s", exc)
            raise
        finally:
            cursor.close()

    # ── UPI top issues ─────────────────────────────────────────────────────────

    def fetch_upi_top_issues(self, limit: int = TRINO_LIMIT) -> List[Dict[str, Any]]:
        """
        Aggregate UPI chatbot sessions from upi_ai_bot_summary_v3
        grouped by l1_fd / l2_fd / issue_category, ordered by volume.
        """
        schema = os.getenv("TRINO_SCHEMA", TRINO_SCHEMA)
        table  = os.getenv("TRINO_TABLE",  TRINO_TABLE)
        sql = f"""
            SELECT
                l1_fd,
                l2_fd,
                issue_category,
                SUM(session_count)     AS total_sessions,
                SUM(sad_feedbacks)     AS sad,
                SUM(happy_feedbacks)   AS happy,
                SUM(neutral_feedbacks) AS neutral
            FROM {schema}.{table}
            GROUP BY l1_fd, l2_fd, issue_category
            ORDER BY total_sessions DESC
            LIMIT {limit}
        """
        return self.execute(sql)

    # ── Chatbot feedback for analysis pipeline ────────────────────────────────

    def fetch_chatbot_feedback(self) -> List[Dict[str, Any]]:
        """
        Fetch chatbot session rows and return plain dicts compatible
        with FeedbackItem construction in sources.py.

        Each row in upi_ai_bot_summary_v3 maps to one FeedbackItem where
        the customer_text is built from the issue labels + LLM summary.
        """
        schema = os.getenv("TRINO_SCHEMA", TRINO_SCHEMA)
        table  = os.getenv("TRINO_TABLE",  TRINO_TABLE)
        sql = f"""
            SELECT
                l1_fd,
                l2_fd,
                issue_category,
                llm_summary_11      AS message,
                session_date        AS created_at,
                session_count,
                sad_feedbacks,
                happy_feedbacks,
                neutral_feedbacks,
                channel,
                txns_status
            FROM {schema}.{table}
            ORDER BY session_date DESC
            LIMIT {TRINO_LIMIT}
        """
        rows = self.execute(sql)
        items = []
        for row in rows:
            summary = str(row.get("message") or "").strip()
            l1 = str(row.get("l1_fd") or "")
            l2 = str(row.get("l2_fd") or "")
            issue = str(row.get("issue_category") or "")

            # Build a meaningful text from the available labels + summary
            text_parts = [p for p in [l1, l2, issue, summary] if p]
            text = " | ".join(text_parts)
            if not text:
                continue

            items.append({
                "id":            str(uuid.uuid4()),
                "source":        "trino_upi_chatbot",
                "timestamp":     _parse_ts(row.get("created_at")),
                "customer_text": text,
                "rating":        None,
                "session_id":    "",
                "intent":        issue,
                "sad":           _safe_float(row.get("sad_feedbacks")),
                "happy":         _safe_float(row.get("happy_feedbacks")),
                "sessions":      _safe_float(row.get("session_count")),
                "raw":           row,
            })
        return items

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_env(cls) -> "TrinoClient":
        user = os.getenv("TRINO_USER", "").strip()
        if not user:
            raise EnvironmentError("TRINO_USER must be set.")
        return cls(
            host=TRINO_HOST,
            port=TRINO_PORT,
            user=user,
            service_user=TRINO_SERVICE_USER,
            service_password=TRINO_SERVICE_PASS,
            catalog=TRINO_CATALOG,
        )


# ── Availability check (kept as superset_configured for sources.py compat) ───

def superset_configured() -> bool:
    """Return True if TRINO_USER is set."""
    return bool(os.getenv("TRINO_USER"))


# Alias so any code importing SupersetClient still works
SupersetClient = TrinoClient
