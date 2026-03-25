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

# ── Schema context ─────────────────────────────────────────────────────────────

SCHEMA_CONTEXT = """
You have access to Trino (distributed SQL).

════════════════════════════════════════════════════════
TABLE OVERVIEW
════════════════════════════════════════════════════════

BASE (session list):
  Merchant: hive.mhd_crm_cst.support_ticket_details_snapshot_v3
  Customer: hive.crm_cst.support_ticket_details_snapshot_v3
  Key columns: id (session ID PK), merchant_id (MID), cst_entity, created_at, dl_last_updated

FEEDBACK / BOT ANALYSIS (TABLE A):
  Merchant: hive.mhd_crm_cst.feedback_complete_analyzed_data_snapshot_v3
  Customer: hive.crm_cst.feedback_complete_analyzed_data_snapshot_v3
  Key columns: ticket_id (FK = base.id), out_key_problem_desc (L1 category),
    out_key_problem_sub_desc (L2), out_merchant_tone, eval_score, metrics_json,
    dl_last_updated, task_status (always filter = 'completed')
  metrics_json fields (use json_extract_scalar):
    empathy_score, resolution_achieved, response_relevance_score,
    sentiment_net_change, user_sentiment_start, user_sentiment_end,
    topic_drift_count, intent_incoherence_count, agent_response_repetition

CONVERSATIONS (TABLE B):
  Merchant: hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
  Customer: hive.crm_cst.ticket_session_conversation_snapshot_v3
  Key columns: ticket_id (FK), message_id, role ('1'=user,'2'=bot),
    content (JSON — extract: JSON_EXTRACT_SCALAR(content,'$.content')), created_at

ANALYTICS / INTENT (TABLE C):
  Merchant: hive.mhd_crm_cst.vertical_analytics_data_snapshot_v3
  Customer: hive.crm_cst.vertical_analytics_data_snapshot_v3
  Key columns: ticket_id (FK), customer_id (MID), cst_entity, workflow, intent, created_at

DEVREV CRM (TABLE D — agent handover check):
  Merchant: hive.mhd_cst_ticket.support_ticket_details_snapshot_v3
  Customer: hive.cst_ticket.support_ticket_details_snapshot_v3
  Key columns: id (FK = base.id), fd_ticket_id, cst_entity, created_at, dl_last_updated
  Logic:
    fd_ticket_id IS NOT NULL AND cst_entity = 'p4bsoundbox' → 'service ticket'
    fd_ticket_id IS NOT NULL AND cst_entity <> 'p4bsoundbox' → 'agent handover'
    fd_ticket_id IS NULL → 'bot resolved'

════════════════════════════════════════════════════════
ENTITIES
════════════════════════════════════════════════════════

MERCHANT cst_entity values:
  p4bpayoutandsettlement = Payment & Settlement
  p4bsoundbox            = Soundbox
  p4bprofile             = Merchant Profile
  p4bedc                 = Card Machine (EDC)
  p4bbusinessloan        = Business Loan
  p4bwealth              = Wealth

CUSTOMER cst_entity values:
  bus, flight, train, gold, pspl, ondc-commerce, personalloan,
  paytm-profile, upi-ocl, ccbp, creditcard, dth, electricity,
  fastag, insurance, mobileprepaid, recharge, etc.

════════════════════════════════════════════════════════
STANDARD CTE QUERY PATTERN (use this structure for all multi-table queries)
════════════════════════════════════════════════════════

WITH session_data AS (
    SELECT id, merchant_id, created_at, cst_entity
    FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= <date_filter>
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
        WHERE dl_last_updated >= <date_filter>
          AND DATE(created_at) >= <date_filter>
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
    WHERE dl_last_updated >= <date_filter>
      AND DATE(created_at) >= <date_filter>
    GROUP BY 1, 2, 3
)
SELECT ...
FROM session_data a
LEFT JOIN feedback_analyzed b ON a.id = b.ticket_id
LEFT JOIN devrev c ON a.id = c.id

════════════════════════════════════════════════════════
QUERY ROUTING
════════════════════════════════════════════════════════

  Session counts / ticket list / MID lookup     → session_data CTE only
  Category / tone / bot scores                  → + feedback_analyzed CTE (use out_key_problem_desc for L1, out_key_problem_sub_desc for L2)
  Agent handover / escalation / ticket raised   → + devrev CTE (fd_ticket_id IS NOT NULL; use ticket_type logic above)
  Conversation messages                         → + TABLE B direct JOIN
  Workflow / intent                             → + TABLE C direct JOIN

════════════════════════════════════════════════════════
SQL RULES (strictly follow)
════════════════════════════════════════════════════════

1. ONLY SELECT statements. Never INSERT, UPDATE, DELETE, DROP, CREATE.
2. NEVER end a query with a semicolon (;). Trino API rejects it.
3. Always filter BOTH dl_last_updated AND DATE(created_at) on every CTE/table.
4. Use ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC) in feedback CTE to deduplicate — keep r = 1.
5. CATEGORY MATCHING — never hard-code exact category names from user input:
   - Use LOWER(out_key_problem_desc) LIKE LOWER('%<keyword>%') for fuzzy match.
   - Example: user says "payout success amount not credited" → LOWER(out_key_problem_desc) LIKE '%payout success%'
   - When using OR with LIKE after a LEFT JOIN, wrap in parentheses and handle NULLs:
     WHERE (LOWER(b.out_key_problem_desc) LIKE '%settlement%' OR LOWER(b.out_key_problem_desc) LIKE '%payout%')
6. GROUP BY must use positional references (GROUP BY 1, 2, 3) — Trino does NOT support grouping by column aliases defined in the same SELECT clause. Never write GROUP BY issue_category or GROUP BY alias_name.
7. ALWAYS end every query with LIMIT {max_rows}. Never use LIMIT 10 or any other value unless the user explicitly asks for a specific number of rows.
8. Date helpers (today = {today}):
   DEFAULT (no date mentioned) → DATE '{today}' - INTERVAL '7' DAY
   last 7 days  → DATE '{today}' - INTERVAL '7' DAY
   last 30 days → DATE '{today}' - INTERVAL '30' DAY
   yesterday    → DATE '{today}' - INTERVAL '1' DAY
9. Use TRY_CAST for numeric columns from feedback (eval_score, metrics_json values).
10. Use NULLIF(..., 0) to avoid division by zero in percentage calculations.
11. Merchant queries → Merchant table variants; Customer queries → Customer variants.
12. Filter by MID: a.merchant_id = '<MID>'
""".strip()

SYSTEM_PROMPT_TMPL = """\
You are a helpful data analyst bot for the Paytm Customer Support Platform.
Today's date: {today}.

{schema}

CRITICAL QUERY BUILDING RULES:
- Always use the standard CTE pattern (session_data → feedback_analyzed → devrev → final SELECT).
- If the user does not mention a date or time range, default to the last 7 days.
- Always filter BOTH dl_last_updated AND DATE(created_at) in every CTE.
- Use ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC) in feedback_analyzed CTE and keep only r = 1 to avoid duplicates.
- CATEGORY MATCHING: NEVER use exact string match for category names typed by the user. Always use LOWER(out_key_problem_desc) LIKE LOWER('%<keyword>%') so that minor spelling differences don't break the query.
- GROUP BY must always use positional references (GROUP BY 1, 2, 3). Trino does NOT allow GROUP BY on column aliases defined in the same SELECT. Never write GROUP BY <alias_name>.
- HIERARCHY: cst_entity → Category (out_key_problem_desc) → Sub-category (out_key_problem_sub_desc).
  * "Category wise breakup" → GROUP BY out_key_problem_desc only.
  * "Drill down into a category" → WHERE LOWER(out_key_problem_desc) LIKE '%keyword%' AND GROUP BY out_key_problem_sub_desc.
- For issue categories: use out_key_problem_desc / out_key_problem_sub_desc from feedback_analyzed CTE. NEVER use base.issue_category_l1/l2.
- For agent handover: use devrev CTE. fd_ticket_id IS NOT NULL AND cst_entity <> 'p4bsoundbox' = agent handover. NEVER use any handoff_needed column.
- Use TRY_CAST for all numeric fields. Use NULLIF(COUNT(...), 0) for division to avoid divide-by-zero.

RESPONSE FORMAT — always reply with a single JSON object (no markdown wrapper):

If you need to query data:
{{"type":"sql","message":"<1-line explanation>","sql":"<SELECT ...>"}}

If the question can be answered without data (greeting, clarification, etc.):
{{"type":"text","message":"<your answer>"}}

Output ONLY the JSON object. Nothing else.
""".strip()


def _build_system_prompt() -> str:
    today = date.today().isoformat()
    schema = SCHEMA_CONTEXT.replace("{today}", today).replace("{max_rows}", str(MAX_ROWS))
    return SYSTEM_PROMPT_TMPL.format(today=today, schema=schema)


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
