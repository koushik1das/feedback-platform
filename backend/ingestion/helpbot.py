"""
Help Bot — natural language → Trino SQL → structured results.

Claude is given full schema context and generates safe SELECT queries.
"""

import os
import re
import json
from datetime import date
from typing import Any, Dict, List

from openai import OpenAI
from trino.dbapi import connect
from trino.auth import BasicAuthentication
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

TRINO_HOST         = os.getenv("TRINO_HOST",             "cdp-trino-query.platform.mypaytm.com")
TRINO_PORT         = int(os.getenv("TRINO_PORT",         "443"))
TRINO_USER         = os.getenv("TRINO_USER",             "")
TRINO_SERVICE_USER = os.getenv("TRINO_SERVICE_USER",     "")
TRINO_SERVICE_PASS = os.getenv("TRINO_SERVICE_PASSWORD", "")
TFY_BASE_URL       = os.getenv("TFY_BASE_URL",           "")
TFY_API_KEY        = os.getenv("TFY_API_KEY",            "")
TFY_MODEL          = os.getenv("TFY_MODEL",              "groq/openai-gpt-oss-120b")

MAX_ROWS = 500

# ── Knowledge base loader ───────────────────────────────────────────────────────

_REPO_ROOT = Path(__file__).resolve().parents[2]
_KB_FILES = [
    _REPO_ROOT / "CST_DATA_GUIDE.md",
    _REPO_ROOT / "feedback-platform" / "master_queries.sql",
]


def _load_kb() -> str:
    """Load CST_DATA_GUIDE.md and master_queries.sql from disk at call time."""
    parts = []
    for path in _KB_FILES:
        try:
            text = path.read_text(encoding="utf-8")
            parts.append(f"### {path.name}\n\n{text}")
        except FileNotFoundError:
            parts.append(f"### {path.name}\n\n[FILE NOT FOUND: {path}]")
    return "\n\n---\n\n".join(parts)


# ── System prompt ───────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TMPL = """\
You are a helpful data analyst bot for the Paytm Customer Support Platform.
Today's date: {today}.

The following is the complete knowledge base for the CST data platform.
Use it as the authoritative source for all schema, table, column, and query pattern decisions.

{kb}

════════════════════════════════════════════════════════
CRITICAL QUERY BUILDING RULES (override any ambiguity above)
════════════════════════════════════════════════════════

STANDARD CTE PATTERN — always use this structure for multi-table queries:

WITH session_data AS (
    SELECT id, merchant_id, created_at, cst_entity
    FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE(created_at) - INTERVAL '1' DAY
      AND DATE(created_at) >= <date_filter>
    GROUP BY 1, 2, 3, 4
),
feedback_analyzed AS (
    SELECT ticket_id, out_key_problem_desc, out_key_problem_sub_desc,
           out_merchant_tone,
           TRY_CAST(eval_score AS DOUBLE) AS eval_score,
           TRY_CAST(json_extract_scalar(metrics_json, '$.empathy_score') AS DOUBLE) AS empathy_score,
           TRY_CAST(json_extract_scalar(metrics_json, '$.resolution_achieved') AS DOUBLE) AS resolution_achieved,
           TRY_CAST(json_extract_scalar(metrics_json, '$.response_relevance_score') AS DOUBLE) AS response_relevance_score
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC) AS r
        FROM hive.mhd_crm_cst.feedback_complete_analyzed_data_snapshot_v3
        WHERE dl_last_updated >= DATE '2025-05-01'
    ) sub WHERE r = 1
),
devrev AS (
    SELECT id, fd_ticket_id,
           CASE
             WHEN cst_entity = 'p4bsoundbox' AND fd_ticket_id IS NOT NULL THEN 'service'
             WHEN cst_entity <> 'p4bsoundbox' AND fd_ticket_id IS NOT NULL THEN 'agent handover'
             ELSE 'bot resolved'
           END AS ticket_type
    FROM hive.mhd_cst_ticket.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE(created_at) - INTERVAL '1' DAY
      AND DATE(created_at) >= <date_filter>
    GROUP BY 1, 2, 3
)
SELECT ...
FROM session_data a
LEFT JOIN feedback_analyzed b ON a.id = b.ticket_id
LEFT JOIN devrev c ON a.id = c.id

KEY RULES:
1. ONLY SELECT statements. Never INSERT, UPDATE, DELETE, DROP, CREATE.
2. NEVER end a query with a semicolon (;). Trino API rejects it.
3. Date filtering:
   - session_data CTE: filter BOTH dl_last_updated AND DATE(created_at) on the session base table.
   - feedback_complete_analyzed: filter ONLY dl_last_updated >= DATE '2025-05-01' (hardcoded safe lower bound).
     DO NOT filter DATE(created_at) on the feedback table — created_at there is the eval job timestamp (D+1), not the session date.
   - devrev CTE: filter BOTH dl_last_updated AND DATE(created_at).
4. Use ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC) in feedback CTE — keep r = 1.
5. ENTITY vs CATEGORY — never confuse:
   - cst_entity = WHICH product/vertical. Filter by cst_entity in session_data. NEVER use LIKE on L1 tags to identify a vertical.
     WRONG: WHERE LOWER(b.out_key_problem_desc) LIKE '%settlement%'
     CORRECT: WHERE a.cst_entity = 'p4bpayoutandsettlement'
   - out_key_problem_desc (L1) / out_key_problem_sub_desc (L2) = WHAT the issue is within the vertical.
     Use LIKE on these only when filtering by a specific issue keyword inside an already entity-scoped query.
6. Add LIMIT {max_rows} unless user asks for fewer rows.
7. Date defaults (today = {today}):
   DEFAULT (no date mentioned) → DATE '{today}' - INTERVAL '7' DAY
   last 7 days  → DATE '{today}' - INTERVAL '7' DAY
   last 30 days → DATE '{today}' - INTERVAL '30' DAY
   yesterday    → DATE '{today}' - INTERVAL '1' DAY
8. Use TRY_CAST for numeric columns from feedback (eval_score, metrics_json values).
9. Use NULLIF(..., 0) to avoid division by zero.
10. Merchant queries → mhd_crm_cst schema; Customer queries → crm_cst schema.
11. GROUP BY and ORDER BY MUST use positional numbers (1, 2, 3…), NEVER column aliases.
    Trino throws COLUMN_NOT_FOUND if you reference aliases. CORRECT: GROUP BY 1 ORDER BY 2 DESC.

RESPONSE FORMAT — always reply with a single JSON object (no markdown wrapper):

If you need to query data:
{{"type":"sql","message":"<1-line explanation>","sql":"<SELECT ...>"}}

If the question can be answered without data (greeting, clarification, etc.):
{{"type":"text","message":"<your answer>"}}

Output ONLY the JSON object. Nothing else.
""".strip()


def _build_system_prompt() -> str:
    today = date.today().isoformat()
    kb = _load_kb()
    return SYSTEM_PROMPT_TMPL.format(today=today, kb=kb, max_rows=MAX_ROWS)


# ── Trino execution ────────────────────────────────────────────────────────────

def _connect():
    return connect(
        host=TRINO_HOST,
        port=TRINO_PORT,
        user=TRINO_USER,
        auth=BasicAuthentication(TRINO_SERVICE_USER, TRINO_SERVICE_PASS),
        catalog="hive",
        http_scheme="https",
    )


def _is_safe_sql(sql: str) -> bool:
    cleaned = sql.strip().lstrip("(").upper()
    if not cleaned.startswith("SELECT") and not cleaned.startswith("WITH"):
        return False
    forbidden = re.compile(
        r'\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b',
        re.IGNORECASE,
    )
    return not forbidden.search(sql)


def execute_sql(sql: str) -> Dict[str, Any]:
    """Execute a SQL string against Trino. Returns {columns, rows, error}."""
    sql = sql.strip().rstrip(';')   # Trino API rejects trailing semicolons
    if not _is_safe_sql(sql):
        return {"columns": [], "rows": [], "error": "Only SELECT queries are allowed."}
    try:
        conn = _connect()
        cur = conn.cursor()
        cur.execute(sql)
        rows = cur.fetchmany(MAX_ROWS)
        columns = [desc[0] for desc in cur.description] if cur.description else []
        safe_rows = []
        for row in rows:
            safe_rows.append([
                v.isoformat() if hasattr(v, "isoformat") else v
                for v in row
            ])
        return {"columns": columns, "rows": safe_rows, "error": None}
    except Exception as e:
        return {"columns": [], "rows": [], "error": str(e)}


# ── Claude call ────────────────────────────────────────────────────────────────

def helpbot_chat(message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Send user message + chat history to GPT OSS 120B via Truefoundry.
    Model returns SQL or text. If SQL, execute on Trino and return results.

    Returns dict:
      type:    "table" | "text" | "error"
      message: str
      sql:     str | None
      columns: list
      rows:    list
    """
    if not TFY_BASE_URL or not TFY_API_KEY:
        return {
            "type": "error",
            "message": "TFY_BASE_URL or TFY_API_KEY is not configured on the server.",
            "sql": None, "columns": [], "rows": [],
        }

    client = OpenAI(api_key=TFY_API_KEY, base_url=TFY_BASE_URL)

    messages = [{"role": "system", "content": _build_system_prompt()}]
    for h in history:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        resp = client.chat.completions.create(
            model=TFY_MODEL,
            max_tokens=2048,
            messages=messages,
        )
        raw = resp.choices[0].message.content.strip()
    except Exception as e:
        return {
            "type": "error",
            "message": f"LLM API error: {e}",
            "sql": None, "columns": [], "rows": [],
        }

    # Parse JSON — strip accidental ```json wrapper
    try:
        raw_clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.DOTALL).strip()
        # Extract JSON object if surrounded by extra text
        match = re.search(r'\{.*\}', raw_clean, re.DOTALL)
        if match:
            raw_clean = match.group(0)
        parsed = json.loads(raw_clean)
    except Exception:
        return {"type": "error", "message": "Failed to parse model response. The query may be too complex — try rephrasing.", "sql": None, "columns": [], "rows": []}

    resp_type = parsed.get("type", "text")
    resp_msg  = parsed.get("message", "")
    sql       = parsed.get("sql")

    if resp_type == "sql" and sql:
        result = execute_sql(sql)
        if result["error"]:
            return {
                "type": "error",
                "message": f"{resp_msg}\n\nQuery error: {result['error']}",
                "sql": sql, "columns": [], "rows": [],
            }

        # ── Second LLM call: analyse the data and answer the user's question ──
        insight = _analyse_data(client, message, result["columns"], result["rows"])
        return {
            "type": "table",
            "message": insight,
            "sql": sql,
            "columns": result["columns"],
            "rows": result["rows"],
        }

    return {
        "type": "text",
        "message": resp_msg or raw,
        "sql": None, "columns": [], "rows": [],
    }


def _analyse_data(client, user_question: str, columns: List, rows: List) -> str:
    """
    Second LLM call: given the raw Trino results, produce a clear natural-language
    answer to the user's original question.
    """
    # Limit rows sent to LLM to avoid token overflow (top 50 rows is enough for analysis)
    sample = rows[:50]

    # Format data compactly as a markdown table
    header = " | ".join(str(c) for c in columns)
    separator = " | ".join(["---"] * len(columns))
    data_rows = "\n".join(
        " | ".join(str(v) if v is not None else "—" for v in row)
        for row in sample
    )
    data_md = f"{header}\n{separator}\n{data_rows}"

    suffix = f"\n\n*(showing {len(sample)} of {len(rows)} rows)*" if len(rows) > len(sample) else ""

    prompt = f"""You are a data analyst for the Paytm Customer Support Platform.
The user asked: "{user_question}"

Here is the data retrieved from Trino:
{data_md}{suffix}

Based on this data, provide a clear, concise answer to the user's question.
- Lead with the key insight or direct answer.
- Use bullet points for lists/rankings.
- Highlight numbers and trends that matter.
- Keep it under 200 words.
- Do NOT repeat the raw table — just interpret and summarise the findings.
"""

    try:
        resp = client.chat.completions.create(
            model=TFY_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        insight = resp.choices[0].message.content.strip()
        if not insight:
            raise ValueError("Empty response from model")
        return insight
    except Exception:
        # Fallback: return a basic summary if the second call fails or returns empty
        if not rows:
            return "No data found for this query."
        top = dict(zip(columns, rows[0]))
        return f"Query returned **{len(rows)}** row(s). Top result: {top}"
