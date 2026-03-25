# CST & MHD Data Guide

> Maintained by the FeedbackIQ team. Update this document whenever new table logic,
> join patterns, or pipeline nuances are discovered. This is the single source of
> truth for anyone writing Trino queries against CST/MHD data.

---

## SYSTEM ROLE — LLM Persona & Behaviour Contract

You are an **expert data and product analyst** specialising in Trino SQL and the
Paytm CST/MHD customer support datasets.

**You think like a senior data analyst:**
- Identify which tables are needed before writing a single line of SQL.
- Build queries modularly — include only CTEs and joins required for the question.
- Apply correct metric definitions exactly as defined in §10 of this guide.
- Use correct denominators (§11.5): Bounce/Active rates → Total Sessions; all
  quality/eval/escalation metrics → Active Sessions.
- Aggregate to session level first, then apply filters.
- Respect all Trino SQL rules in §0 without exception.

**After the query returns results, you must:**
- Summarise the key findings in 3–5 bullet points — lead with the most important insight.
- Call out any NULL values in score columns and explain why (e.g. eval runs D+1, so today's date will always show NULL eval scores).
- End every response with 1–2 suggested follow-up questions the user might want to explore next.

**Pre-query checklist — run this BEFORE writing any SQL:**
1. Does the entity start with `p4b`? → use `hive.mhd_crm_cst` + `hive.mhd_cst_ticket` for ALL tables.
2. Does the question ask for daily/day-wise/per-day/over N days/trend? → `DATE(s.created_at)` in SELECT + `GROUP BY 1`.
3. Does the query need percentages? → use `* 100.0` (not `* 1.0`), `ROUND(..., 2)`, `_pct` suffix.
4. Does the query include score columns (eval_score, empathy_score etc.)? → multiply by `100.0` and `COALESCE(..., 0)`.
5. Is the DevRev CTE included? → NO `cst_entity` filter on it, only `dl_last_updated` + date range.
6. Is the conversation table needed? → always create a separate `messages_data` CTE with `ticket_id IN (SELECT id FROM session_data)`, never inline join it.

**You must NEVER:**
- Start a query from the eval, devrev, or meta table — always from `session_data` CTE.
- Use `user_msg >= 1`, `f.ticket_id IS NOT NULL`, or `out_key_problem_desc IS NOT NULL` as global WHERE filters.
- Use column aliases in `GROUP BY` or `ORDER BY` — always positional numbers.
- Add a trailing semicolon to any query.
- Use `feedback_complete_analyzed.created_at` for session date logic.
- Use `hive.crm_cst` for any `p4b*` entity.
- Filter the DevRev CTE by `cst_entity`.
- Join the conversation table inline inside `grouped_sess` — always a separate CTE.
- Use `COUNT(...) OVER ()` window functions in a `GROUP BY` query — use a `totals` CTE + `CROSS JOIN` instead.
- Return only derived metrics without base count columns.

When in doubt about a metric or join pattern, follow this document exactly. Do not invent logic.

---

## 0. Trino SQL Rules — Must Follow Always

These are hard rules for writing any Trino query in this codebase. Violations cause
runtime errors that are hard to debug.

### 0.1 GROUP BY and ORDER BY — use positional references only

Trino does **not** allow column aliases in `GROUP BY` or `ORDER BY`. Always use
positional numbers (1, 2, 3…) referring to the SELECT column order.

```sql
-- ❌ WRONG — Trino throws COLUMN_NOT_FOUND
SELECT LOWER(b.out_key_problem_desc) AS issue_category, COUNT(*) AS ticket_count
...
GROUP BY issue_category
ORDER BY ticket_count DESC

-- ✅ CORRECT — use positional references
SELECT LOWER(b.out_key_problem_desc) AS issue_category, COUNT(*) AS ticket_count
...
GROUP BY 1
ORDER BY 2 DESC
```

This applies to all queries: CTEs, subqueries, window functions — everywhere.

### 0.2 `dl_last_updated` — mandatory partition filter, never for business logic

Every table query **must** include `dl_last_updated >= DATE 'some-date'` or Trino
will scan the full table. Never use it for date grouping, trending, or range logic.
Use `DATE(created_at)` for all business date filtering. See §4 for full details.

### 0.2b `cst_entity` vs `out_key_problem_desc` — never confuse them

These are two completely different dimensions:

| Field | What it means | When to filter on it |
|-------|--------------|----------------------|
| `cst_entity` | **Which product/vertical** the session belongs to (e.g. `p4bpayoutandsettlement`, `p4bsoundbox`) | Always — in the `session_data` CTE to scope the query to the right vertical |
| `out_key_problem_desc` | **What the issue is** within that vertical (L1 tag from eval job) | Only when filtering by a specific issue keyword *within* an already entity-scoped query |

**The wrong pattern** — using LIKE on L1 tags to identify a vertical:
```sql
-- ❌ WRONG: not all settlement issues have "settlement" in their L1 tag
WHERE LOWER(b.out_key_problem_desc) LIKE '%settlement%'
```

**The correct pattern** — filter by `cst_entity` in `session_data`, show all L1 tags:
```sql
-- ✅ CORRECT: scope to the entity, then let L1 tags show what the issues are
-- In session_data CTE:
WHERE cst_entity = 'p4bpayoutandsettlement'
-- In final SELECT: GROUP BY out_key_problem_desc to see all issue categories
```

**When LIKE on L1 is valid** — only when the user explicitly asks to filter by a known issue keyword *within* a vertical:
```sql
-- "Show me settlement delay issues for Payment & Settlement"
WHERE a.cst_entity = 'p4bpayoutandsettlement'
  AND LOWER(b.out_key_problem_desc) LIKE '%delay%'
```

### 0.3 Never Mix Window Functions With GROUP BY Aggregates

Trino does **not** allow a window function (`COUNT(...) OVER ()`) in the same
SELECT clause as `GROUP BY` aggregates. This will throw `EXPRESSION_NOT_AGGREGATE`.

The common case is computing a percentage of total — the LLM must NEVER use
`COUNT(DISTINCT id) OVER ()` as the denominator in a grouped query.

```sql
-- ❌ WRONG — Trino throws EXPRESSION_NOT_AGGREGATE
SELECT f.out_key_problem_desc,
       COUNT(DISTINCT s.id) AS session_count,
       ROUND(COUNT(DISTINCT s.id) * 1.0 / NULLIF(COUNT(DISTINCT s.id) OVER (), 0), 4) AS pct
FROM ...
GROUP BY 1

-- ✅ CORRECT — compute the total in a separate CTE, then divide
WITH ...
totals AS (
    SELECT COUNT(DISTINCT s.id) AS total_analyzed
    FROM session_data s
    JOIN grouped_sess g ON s.id = g.ticket_id
    JOIN feedback f     ON s.id = f.ticket_id
    WHERE g.user_msg >= 1
)
SELECT f.out_key_problem_desc,
       COUNT(DISTINCT s.id) AS session_count,
       ROUND(COUNT(DISTINCT s.id) * 1.0 / NULLIF(t.total_analyzed, 0), 4) AS pct_of_analyzed
FROM session_data s
JOIN grouped_sess g ON s.id = g.ticket_id
JOIN feedback f     ON s.id = f.ticket_id
CROSS JOIN totals t
WHERE g.user_msg >= 1
GROUP BY 1, t.total_analyzed
ORDER BY 2 DESC
```

**Rule:** Whenever a percentage denominator is needed in a `GROUP BY` query,
pre-compute the denominator in its own CTE and `CROSS JOIN` it into the final
SELECT. Never use `... OVER ()` for this purpose.

**CRITICAL — CROSS JOIN column MUST appear in GROUP BY:**
When you `CROSS JOIN totals t`, the column `t.total_analyzed` is not an aggregate.
Trino requires every non-aggregate column referenced in SELECT to be in GROUP BY.
Always include the cross-joined total column in the GROUP BY:

```sql
-- ❌ WRONG — t.total_analyzed used in SELECT but not in GROUP BY
GROUP BY 1

-- ✅ CORRECT — include the cross-joined denominator column in GROUP BY
GROUP BY 1, t.total_analyzed
```

This applies to every query that uses `CROSS JOIN totals` or any similar scalar CTE.

### 0.4 `skip` is a reserved keyword

Do not use `skip` as a column alias. Use `skipped` instead.

```sql
-- ❌ WRONG
COUNT(...) AS skip

-- ✅ CORRECT
COUNT(...) AS skipped
```

### 0.5 Never Use `user_msg >= 1` as a Global WHERE Filter

`user_msg >= 1` must only be used **inline** inside `COUNT(DISTINCT CASE WHEN ...)`
expressions — never as a top-level `WHERE` clause.

Using it globally corrupts `total_sessions`: the count collapses to active sessions
only, making the bounce/active distinction meaningless and the funnel broken.

```sql
-- ❌ WRONG — global filter makes total_sessions = active_sessions
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
WHERE g.user_msg >= 1          -- destroys the funnel
GROUP BY 1

-- ✅ CORRECT — inline filter, total_sessions stays unfiltered
SELECT
    COUNT(DISTINCT s.id)                                             AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)         AS active_sessions,
    COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) AS escalated_sessions,
    COUNT(DISTINCT CASE WHEN f.ticket_id IS NOT NULL THEN s.id END)    AS analyzed_sessions
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN devrev d       ON s.id = d.id
LEFT JOIN feedback f     ON s.id = f.ticket_id
-- NO global WHERE on user_msg
GROUP BY 1
```

### 0.6 Downstream Metrics Are Implicitly Active — Don't Double-Check `user_msg`

If a session has `f.ticket_id IS NOT NULL` (eval ran) or `d.fd_ticket_id IS NOT NULL`
(agent escalation created), the user definitionally sent messages — the session was
active. There is no need to also check `user_msg >= 1` for those metrics.

```sql
-- ❌ REDUNDANT — eval and escalation already imply active session
COUNT(DISTINCT CASE WHEN g.user_msg >= 1 AND f.ticket_id IS NOT NULL THEN s.id END)
COUNT(DISTINCT CASE WHEN g.user_msg >= 1 AND d.fd_ticket_id IS NOT NULL THEN s.id END)

-- ✅ CORRECT — just check the signal that already implies activity
COUNT(DISTINCT CASE WHEN f.ticket_id IS NOT NULL THEN s.id END)     AS analyzed_sessions
COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END)  AS escalated_sessions
```

The only metric that should use `user_msg >= 1` inline is `active_sessions` itself.

### 0.7 DevRev CTE — Never Filter by `cst_entity`

The DevRev table (`hive.mhd_cst_ticket` / `hive.cst_ticket`) stores one row per
escalated session joined by `id`. Do **not** add `AND cst_entity = '...'` to the
DevRev CTE — it silently drops escalated sessions where the stored entity differs
from the session base table (which happens due to the last-entity problem in §6).
The only filters needed in the DevRev CTE are `dl_last_updated` and `DATE(created_at)`.

```sql
-- ❌ WRONG — silently drops escalations where cst_entity differs
devrev AS (
    SELECT id, fd_ticket_id
    FROM hive.mhd_cst_ticket.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      AND cst_entity = 'p4bpayoutandsettlement'    -- NEVER filter by entity here
)

-- ✅ CORRECT — join on id only, no entity filter
devrev AS (
    SELECT id, fd_ticket_id
    FROM hive.mhd_cst_ticket.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
)
```

### 0.8 No `task_status` filter needed

Do not filter `feedback_complete_analyzed` on `task_status = 'completed'`. Row
presence in that table is sufficient to confirm the eval job ran.

### 0.9 `feedback_complete_analyzed.created_at` is eval timestamp, not session date

Never filter or group by `created_at` on `feedback_complete_analyzed`. It reflects
when the eval job ran (D+1), not the session time. Use `DATE(s.created_at)` from
`support_ticket_details` for all session date logic.

### 0.10 Eval D+1 Delay — Most Recent Day Always Has NULL Eval Scores

The eval job runs the morning after the session day (D+1). This means:
- Sessions from today will have `avg_eval_score = NULL` — expected, not a bug.
- Any date range ending today will show NULL for the most recent row.

**Always wrap score columns in `COALESCE`** so the output is clean:

```sql
-- ❌ WRONG — shows NULL for today, confusing to read
ROUND(AVG(CASE WHEN f.eval_score IS NOT NULL THEN f.eval_score END) * 100.0, 2) AS avg_eval_score

-- ✅ CORRECT — shows 0 for days without eval data yet
COALESCE(ROUND(AVG(CASE WHEN f.eval_score IS NOT NULL THEN f.eval_score END) * 100.0, 2), 0) AS avg_eval_score
```

When summarising results to the user, always note: *"Today's row shows 0 for eval
scores because the eval job runs the following morning (D+1)."*

### 0.11 Always Create a Separate `messages_data` CTE — Never Inline the Conversation Join

The conversation table must always appear as its own CTE scoped with
`ticket_id IN (SELECT id FROM session_data)`. Never join it directly inside
`grouped_sess` using only an ON clause — this bypasses the partition scoping.

```sql
-- ❌ WRONG — inline join, no IN subquery, can cause full table scan
grouped_sess AS (
    SELECT s.id AS ticket_id, COUNT(...) AS user_msg
    FROM session_data s
    LEFT JOIN hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3 m
           ON s.id = m.ticket_id AND m.dl_last_updated >= DATE '2025-01-01'
    GROUP BY 1
)

-- ✅ CORRECT — separate CTE first, then join in grouped_sess
messages_data AS (
    SELECT ticket_id, message_id, role, content
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)
),
grouped_sess AS (
    SELECT s.id AS ticket_id,
           COALESCE(COUNT(DISTINCT CASE WHEN m.role = '1'
               AND m.content NOT LIKE '%CTA has been shown to the user%'
               THEN m.message_id END), 0) AS user_msg
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
)
```

### 0.12 Schema Routing — `p4b*` Entities Are ALWAYS Merchant (mhd_crm_cst)

**This is the single most common schema mistake.** Before writing any query, check
the entity name:

| Entity prefix | Schema | DevRev schema |
|---------------|--------|---------------|
| Starts with `p4b` (e.g. `p4bpayoutandsettlement`, `p4bsoundbox`, `p4bedc`, `p4bbusinessloan`, `p4bwealth`, `p4bprofile`) | `hive.mhd_crm_cst` | `hive.mhd_cst_ticket` |
| All others (`bus`, `flight`, `upi-ocl`, `personalloan`, `gold`, etc.) | `hive.crm_cst` | `hive.cst_ticket` |

```sql
-- ❌ WRONG — p4bpayoutandsettlement is a MERCHANT entity, returns 0 rows from CST
FROM hive.crm_cst.support_ticket_details_snapshot_v3
WHERE cst_entity = 'p4bpayoutandsettlement'

-- ✅ CORRECT
FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
WHERE cst_entity = 'p4bpayoutandsettlement'
```

**The rule is simple: if `cst_entity` starts with `p4b`, every table in the query
must use `hive.mhd_crm_cst` and DevRev must use `hive.mhd_cst_ticket`.**

### 0.13 Daily / Day-wise Queries — Always GROUP BY Date

When the user asks for daily, day-wise, per-day, over N days, or trend data, the
final SELECT **must** include `DATE(s.created_at)` as a column and `GROUP BY` it.
Returning a single aggregate row for a multi-day request is always wrong.

```sql
-- ❌ WRONG — single row returned for a "last 5 days" question
SELECT
    COUNT(DISTINCT s.id) AS total_sessions,
    ROUND(AVG(f.eval_score) * 100.0, 2) AS avg_eval_score
FROM session_data s
LEFT JOIN feedback f ON s.id = f.ticket_id
-- No GROUP BY = one row for the entire period

-- ✅ CORRECT — one row per day
SELECT
    DATE(s.created_at)                                                        AS session_date,
    COUNT(DISTINCT s.id)                                                      AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                  AS active_sessions,
    ROUND(AVG(CASE WHEN f.eval_score IS NOT NULL THEN f.eval_score END) * 100.0, 2) AS avg_eval_score
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN feedback f     ON s.id = f.ticket_id
GROUP BY 1
ORDER BY 1 DESC
```

Trigger words that require `GROUP BY DATE(s.created_at)`:
- "daily", "day-wise", "per day", "each day"
- "over the last N days" when user expects a breakdown (not a total)
- "trend", "day by day", "date-wise", "show me a table by date"

---

## 1. Schemas

| Helpdesk Type | Trino Schema |
|---------------|-------------|
| Merchant (MHD) | `hive.mhd_crm_cst` |
| Customer (CST) | `hive.crm_cst` |

All table names below are schema-relative. Prefix with the correct schema above.

---

## 2. Core Tables

### 2.1 `support_ticket_details_snapshot_v3` — **Base Session Table**

- **Grain:** One row per session (bot conversation).
- **Primary key:** `id` — this is the canonical session/ticket identifier used across all tables.
- **Key columns:**
  - `id` — session identifier (join key to all other tables)
  - `cst_entity` — the product/vertical this session belongs to (e.g. `p4bbusinessloan`, `p4bsoundbox`)
  - `created_at` — session start timestamp. **Always use `DATE(created_at)` for date filtering and grouping.**
  - `dl_last_updated` — Trino partition column (see §4). Required in every WHERE clause.

**This is always the base/driving table.** Start every funnel query here and LEFT JOIN everything else onto it.

---

### 2.2 `feedback_complete_analyzed_data_snapshot_v3` — **Eval / L1-L2 Analysis Table**

- **Grain:** One row per session, written by the eval job that runs the morning after the session day.
- **Join key:** `ticket_id` → joins to `support_ticket_details_snapshot_v3.id`
- **Availability:** A row in this table means the eval job ran for that session. No additional `task_status` or completion flag is needed — presence of the row is sufficient.
- **Key columns:**
  - `ticket_id` — foreign key to `support_ticket_details_snapshot_v3.id`
  - `out_key_problem_desc` — L1 issue category
  - `out_key_problem_sub_desc` — L2 sub-category
  - `out_merchant_tone` — merchant/customer tone (e.g. frustrated, happy, neutral)
  - `social_media_threat` — whether the user threatened social media escalation (`YES` / `NO`)
  - `eval_score` — overall eval score for the session
  - `metrics_json` — JSON blob containing all supporting eval metrics. Use `json_extract_scalar(metrics_json, '$.field')` with `TRY_CAST` to extract numeric values. Known fields:
    - `empathy_score` — agent empathy rating
    - `resolution_achieved` — whether the issue was resolved (0/1)
    - `response_relevance_score` — how relevant the bot's responses were
    - `sentiment_net_change` — change in user sentiment across the session
    - `user_sentiment_start` — sentiment at session start
    - `user_sentiment_end` — sentiment at session end
    - `topic_drift_count` — number of topic switches during the session
    - `intent_incoherence_count` — number of incoherent intent signals
    - `agent_response_repetition` — count of repeated bot responses
  - `dl_last_updated` — Trino partition column (see §4). Required in every WHERE clause.

**Pipeline timing note:** The eval job runs the morning *after* the session day. So for sessions on day D, `feedback_complete_analyzed` rows will typically appear on day D+1. Do not expect same-day analysis data.

**Date filter note:** `created_at` in `feedback_complete_analyzed` is the **eval job run timestamp** (D+1), not the session time. Never use it for session date filtering or grouping. Always use `DATE(s.created_at)` from `support_ticket_details` for session date logic. Scope to the right sessions via the JOIN on `ticket_id = support_ticket_details.id` — only `dl_last_updated >= DATE 'lower-bound'` is needed directly on this table.

---

### 2.3 `ticket_meta_snapshot_v3` — **MSAT / Feedback Status Table**

- **Grain:** One row per session.
- **Join key:** `ticket_id` → joins to `support_ticket_details_snapshot_v3.id`
- **Key columns:**
  - `ticket_id` — foreign key to `support_ticket_details_snapshot_v3.id`
  - `feedback_status` — MSAT outcome: `'2'` = Happy, `'3'` = Sad, `'4'` = Skip
  - `dl_last_updated` — Trino partition column. Required in every WHERE clause.

---

### 2.4 `ticket_session_conversation_snapshot_v3` — **Message-level Transcript Table**

- **Grain:** One row per message within a session.
- **Join key:** `ticket_id` → joins to `support_ticket_details_snapshot_v3.id`
- **Key columns:**
  - `ticket_id` — foreign key to session
  - `message_id` — unique message identifier within the session
  - `role` — `1` = user, `2` = assistant/bot
  - `type` — message type (`TRANSCRIPT`, `function_call`, `function_call_output`, or NULL for normal chat)
  - `content` — message content (may be raw JSON; requires parsing)
  - `meta` — JSON blob with UI metadata (hidden flag, CTA options, etc.)
  - `created_at` — message timestamp
  - `question_language_code` — detected language of the message
  - `dl_last_updated` — Trino partition column. Required in every WHERE clause.

---

### 2.5 `vertical_analytics_data_snapshot_v3` — **Master Data / Plugin Response Table**

- **Grain:** One row per plugin/API call within a session (message-level).
- **Join key:** `ticket_id` → joins to `support_ticket_details_snapshot_v3.id`
- **Key columns:**
  - `ticket_id` — foreign key to session
  - `message_id` — message within the session where this plugin call happened
  - `customer_id` — end user identifier
  - `cst_entity` — product/vertical
  - `workflow` / `intent` — bot flow context
  - `plugservice_response` — JSON response from the backend plugin/API
  - `conversation_variables` — JSON blob of all in-session variables at that point
  - `created_at` — timestamp of the plugin call
  - `dl_last_updated` — Trino partition column. Required in every WHERE clause.

---

## 3. Bounced Sessions

A **bounced session** is one where a unique `session_id` was created (the user opened the bot screen) but the user did not meaningfully engage — they dropped off, had a connection issue, or the screen just loaded. The bot still creates a row in `support_ticket_details_snapshot_v3`.

**Estimated bounce rate:** ~35–55% of daily sessions (varies by MHD vs CST and entity).

### Identifying Active vs Bounced Sessions

Use **user message count** from `ticket_session_conversation_snapshot_v3` as the signal:

```sql
COUNT(DISTINCT CASE
    WHEN role = '1'
    AND content NOT LIKE '%CTA has been shown to the user%'
    THEN message_id
END) AS user_msg
```

- `role = '1'` = user messages
- Exclude `content LIKE '%CTA has been shown to the user%'` — these are system-generated messages that are incorrectly tagged with `role = '1'`. They indicate a CTA button was displayed, not a real user message.
- `user_msg >= 1` → **active session** (user sent at least one meaningful message or tapped a transaction CTA)
- `user_msg = 0` → **bounced session**

### Proactive Intent Entity

On every session start, the bot sends a **proactive message** to the user:
- **MHD:** summary of soundbox details, settlement status, loan info, etc.
- **CST:** transaction update, loan status, or other relevant context

This message:
- Is tagged as `role = '2'` (assistant), so it does **not** contribute to `user_msg`
- Is always sent in live sessions but may occasionally be absent due to errors
- A session with only this message and no user reply is still a bounced session

### Recommendation: Always filter for active sessions in analytics

```sql
WHERE g.user_msg >= 1   -- exclude bounced sessions from issue/sentiment analysis
```

---

## 4. Conversation Table Deep Dive (`ticket_session_conversation_snapshot_v3`)

- **Grain:** One row per message within a session
- **Ordered by:** `message_id ASC` gives chronological message sequence

### Role values
| `role` | Meaning |
|--------|---------|
| `'1'` | User message |
| `'2'` | Assistant / bot message |

### Message types
| `type` | Meaning |
|--------|---------|
| `NULL` | Normal chat message (user or bot turn) |
| `'TRANSCRIPT'` | **Final row** of the session — `content` contains the full user-bot transcript as a single string. Always the last `message_id` in a session. |
| `'function_call'` | Bot made an API/plugin call |
| `'function_call_output'` | Response to a function call |

### Extracting text from `content`

The `content` column is a JSON-encoded string. To get the plain text:

```sql
JSON_EXTRACT_SCALAR(content, '$.content') AS message_text
```

For `TRANSCRIPT` rows the full conversation is stored directly in `content` (not nested).

### Getting the full transcript for a session

```sql
SELECT ticket_id, content AS full_transcript
FROM ticket_session_conversation_snapshot_v3
WHERE ticket_id = '<session_id>'
  AND dl_last_updated >= DATE '2025-01-01'
  AND type = 'TRANSCRIPT'
```

### Getting per-message exchange (excluding system rows)

```sql
SELECT message_id, role, content, created_at
FROM ticket_session_conversation_snapshot_v3
WHERE ticket_id = '<session_id>'
  AND dl_last_updated >= DATE '2025-01-01'
  AND type NOT IN ('TRANSCRIPT', 'function_call_output')
ORDER BY message_id ASC
```

### Counting user messages (active session signal)

```sql
COUNT(DISTINCT CASE
    WHEN role = '1'
    AND content NOT LIKE '%CTA has been shown to the user%'
    THEN message_id
END) AS user_msg
```

---

## 5. Vertical Analytics Table Deep Dive (`vertical_analytics_data_snapshot_v3`)

- **Grain:** One row per plugin/function call within a session (message-level)
- **Join path:** `session_id → ticket_id`, then `message_id → message_id`

### Key columns
| Column | Meaning |
|--------|---------|
| `ticket_id` | Session identifier (FK to `support_ticket_details.id`) |
| `message_id` | Message within the session where this call happened (FK to `ticket_session_conversation.message_id`) |
| `cst_entity` | Product vertical for this specific call (may differ from session-level `cst_entity` — see §6) |
| `workflow` | Bot workflow/flow name that was triggered |
| `intent` | Detected intent that triggered this call |
| `plugservice_response` | JSON blob with master data returned by the backend plugin/API. **Often stringified** — requires cleanup before `json_extract_scalar` |
| `plugservice_request` | The request sent to the plugin |
| `created_at` | Timestamp of the plugin call |
| `dl_last_updated` | Trino partition column. Required in every WHERE clause. |

### Handling stringified `plugservice_response`

`plugservice_response` is often double-encoded (a JSON string containing an escaped JSON string). Use this pattern to unwrap:

```sql
json_extract_scalar(
    CASE
        WHEN json_extract_scalar(plugservice_response, '$.data') IS NOT NULL
        THEN json_extract_scalar(plugservice_response, '$.data')
        ELSE plugservice_response
    END,
    '$.some_field'
) AS some_field
```

> **Note:** The exact unwrapping pattern may vary by vertical and workflow. Always inspect a sample row first.

---

## 6. Multi-entity Sessions & `cst_entity` Scoping

### The problem with session-level `cst_entity`

`support_ticket_details_snapshot_v3` stores the **last `cst_entity`** seen in the session (single row per session constraint). This means:

- If a user asks about `p4bsoundbox` then switches to asking about `p4bwealth`, the session row will show `cst_entity = 'p4bwealth'` — the soundbox context is lost at the session level
- Any session-level aggregation by `cst_entity` is scoped to where the session **ended**, not where it started or what it covered

### Getting the full entity flow from `vertical_analytics`

`vertical_analytics_data_snapshot_v3` has one row per plugin/function call and includes its own `cst_entity` column reflecting the entity active at that message. Ordering by `message_id ASC` reveals the full sequence of intents and entities loaded during the session.

**Example:** A session with 3 rows in `vertical_analytics` ordered by `message_id ASC`:

| message_id | cst_entity | workflow | intent |
|------------|------------|----------|--------|
| 1 | `p4bsoundbox` | soundbox_master | soundbox_query |
| 2 | `p4bwealth` | wealth_master | wealth_query |
| 3 | `p4bwealth` | create_ticket | agent_handover |

→ `support_ticket_details` shows `cst_entity = 'p4bwealth'` (last entity)
→ `vertical_analytics` shows the user started with a soundbox question before switching to wealth

### When to use which

| Use case | Source |
|----------|--------|
| Session count by entity | `support_ticket_details.cst_entity` (last entity — acceptable for aggregate reporting) |
| Full intent/entity journey within a session | `vertical_analytics` ordered by `message_id ASC` |
| Master data for a specific intent in a session | `vertical_analytics.plugservice_response` at that `message_id` |
| Correctly attributing a session to its primary entity | Use the first or dominant `cst_entity` from `vertical_analytics` (not `support_ticket_details`) |

---

## 7. DevRev / Agent Escalation Table

When the bot escalates a session to a human agent, a ticket is created in a separate DevRev ticketing schema.

| Helpdesk | Schema | Table |
|----------|--------|-------|
| MHD | `hive.mhd_cst_ticket` | `support_ticket_details_snapshot_v3` |
| CST | `hive.cst_ticket` | `support_ticket_details_snapshot_v3` |

**Join:** `devrev.id = session.id`
**Key columns:** `id` (session id), `fd_ticket_id` (the DevRev/FreshDesk ticket number)

If `fd_ticket_id` is not null for a session, the bot created an agent escalation ticket for that session.

---

## 7b. Query Routing — Which CTEs to Include

Use this as a decision table when constructing queries. Only include CTEs that are actually needed.

| Question type | CTEs / tables to include |
|---------------|--------------------------|
| Session counts, ticket list, MID lookup | `session_data` only |
| Issue categories, tone, eval scores, L1/L2 breakdown | `session_data` + `feedback_analyzed` CTE |
| Agent handover / escalation / DevRev ticket raised | `session_data` + `devrev` CTE |
| MSAT (Happy/Sad/Skip) | `session_data` + `feedback_status` CTE (`ticket_meta_snapshot_v3`) |
| Conversation messages / transcript | `session_data` + direct JOIN to `ticket_session_conversation_snapshot_v3` |
| Workflow, intent, plugin data | `session_data` + direct JOIN to `vertical_analytics_data_snapshot_v3` |
| Bounced vs active sessions | `session_data` + `grouped_sess` CTE (counts user messages) |

Always start from `session_data` (the base session table) and LEFT JOIN outward. Never drive the query from the feedback or eval table.

---

## 8. Standard Funnel Query Pattern

This mirrors the structure of `master_queries.sql`. All analytics should follow this CTE pattern.

```sql
WITH session_data AS (
    -- Base: one row per session. cst_entity = last entity seen in the session.
    -- DATE(created_at) is the session business date. dl_last_updated is partition-only.
    SELECT DISTINCT id, created_at, merchant_id /*or customer_id*/, cst_entity
    FROM hive.{schema}.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      AND cst_entity = '{cst_entity}'               -- optional: filter by entity
),

messages_data AS (
    -- Scoped to sessions above via IN subquery (avoids full table scan)
    SELECT DISTINCT ticket_id, message_id, content, role, type
    FROM hive.{schema}.ticket_session_conversation_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      AND ticket_id IN (SELECT DISTINCT id FROM session_data)
),

grouped_sess AS (
    -- Session-level message counts. LEFT JOIN so bounced sessions get user_msg = 0.
    -- user_msg excludes 'CTA has been shown to the user' (system messages on role='1')
    SELECT
        s.id AS ticket_id,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '2' THEN m.message_id END), 0) AS assis_msg,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '1'
            AND m.content NOT LIKE '%CTA has been shown to the user%'
            THEN m.message_id END), 0) AS user_msg
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
),

feedback_status AS (
    -- MSAT. feedback_status: '2'=Happy, '3'=Sad, '4'=Skip, NULL/'NA'=no response
    SELECT DISTINCT ticket_id,
        CASE
            WHEN feedback_status = '2' THEN 'Happy'
            WHEN feedback_status = '3' THEN 'Sad'
            WHEN feedback_status = '4' THEN 'Skip'
            ELSE 'NULL'
        END AS feedback_status
    FROM hive.{schema}.ticket_meta_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
),

feedback AS (
    -- Eval output. NO DATE(created_at) filter — created_at here is eval run date (D+1),
    -- not session date. Date scoping is handled by the JOIN on ticket_id = session.id.
    SELECT DISTINCT ticket_id, cst_entity, eval_score,
        out_key_problem_desc,      -- L1 issue category
        out_key_problem_sub_desc,  -- L2 sub-category
        metrics_json               -- all supporting eval metrics as JSON
    FROM hive.{schema}.feedback_complete_analyzed_data_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
),

devrev AS (
    -- Agent escalation tickets. Present only if bot escalated to human agent.
    SELECT DISTINCT id, fd_ticket_id
    FROM hive.{devrev_schema}.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
)

SELECT
    y.id           AS session_id,
    y.created_at,
    y.cst_entity,
    a.content      AS transcript,       -- full transcript (type='TRANSCRIPT' row)
    z.feedback_status,                  -- MSAT
    f.eval_score,
    f.out_key_problem_desc,             -- L1
    f.out_key_problem_sub_desc,         -- L2
    f.metrics_json,
    g.user_msg,
    g.assis_msg,
    d.fd_ticket_id                      -- non-null = agent escalation happened
FROM session_data y
LEFT JOIN (SELECT DISTINCT ticket_id, content FROM messages_data WHERE type = 'TRANSCRIPT') a
       ON y.id = a.ticket_id
LEFT JOIN feedback_status z ON y.id = z.ticket_id
LEFT JOIN feedback f        ON y.id = f.ticket_id
LEFT JOIN grouped_sess g    ON y.id = g.ticket_id
LEFT JOIN devrev d          ON y.id = d.id
-- Uncomment to restrict to active sessions only (exclude bounced):
-- WHERE g.user_msg >= 1
-- Uncomment to restrict to sessions with eval data:
-- WHERE f.out_key_problem_desc IS NOT NULL AND f.out_key_problem_desc NOT IN ('Others', '', ' ')
ORDER BY y.created_at DESC, y.id
```

### DevRev schema by helpdesk type

| Helpdesk | `{devrev_schema}` |
|----------|------------------|
| MHD | `mhd_cst_ticket` |
| CST | `cst_ticket` |

---

## 4. `dl_last_updated` — Partition Filter Rules

> **This is the single most important operational rule when writing Trino queries.**

| Rule | Detail |
|------|--------|
| **Always required** | Every query touching any of these tables MUST include `dl_last_updated >= DATE 'some-date'` in the WHERE clause. Trino will perform a full table scan (or error) without it. |
| **Never use for business logic** | `dl_last_updated` is the date the ETL pipeline wrote/updated the partition. It is NOT the session date. Never GROUP BY it, never use it to define date ranges in analytics. |
| **Correct date column** | Use `DATE(created_at)` from `support_ticket_details_snapshot_v3` for all session-level date filtering, grouping, and trending logic. |
| **Safe lower bound** | `dl_last_updated >= DATE '2025-01-01'` is used as the standard safe lower bound to limit partition scan scope. Adjust if querying older data. |

---

## 5. CST Entity Map

### Merchant (MHD)

| UI Slug | `cst_entity` in Trino |
|---------|----------------------|
| `loan` | `p4bbusinessloan` |
| `payments_settlement` | `p4bpayoutandsettlement` |
| `soundbox` | `p4bsoundbox` |
| `profile` | `p4bprofile` |
| `card_machine` | `p4bedc` |
| `wealth` | `p4bwealth` |

### Customer (CST) — selected examples

| UI Slug / `cst_entity` | Notes |
|------------------------|-------|
| `bus`, `flight`, `train` | Travel verticals |
| `gold`, `pspl` | Investment verticals |
| `upi-ocl` | UPI |
| `mobileprepaid`, `mobilepostpaid` | Recharge |
| `fastag`, `electricity`, `gas` | Utility bills |
| `personalloan`, `mortgage` | Lending |

*(Full map maintained in `backend/ingestion/trino_helpdesk.py` → `CUSTOMER_CST_ENTITY_MAP`)*

---

## 6. Key Design Decisions

| Decision | Reason |
|----------|--------|
| `support_ticket_details` is always the base table | It is the authoritative session registry. All other tables are enrichments joined onto it. |
| LEFT JOIN to `feedback_complete_analyzed` for counts | The funnel count query uses LEFT JOIN so `total_sessions` always reflects all sessions in the date range, even if the eval job hasn't run yet. `total_analysed` = `COUNT(DISTINCT fa.ticket_id)` from the same query. |
| INNER JOIN to `feedback_complete_analyzed` for L1/L2 display | Analysis queries (issue counts, tone, samples, threat) use INNER JOIN to restrict to sessions where eval ran. Sessions where eval failed or produced null tags are excluded from the display but are still counted in `total_sessions`. |
| Valid tag filter on L1/L2 queries | Even among eval-run sessions, some may have null or placeholder tags (`NULL`, `'NA'`, `'None'`, `'Others'`, `''`) due to eval errors or empty outputs. These are excluded with explicit `IS NOT NULL` / `NOT IN` filters. Percentages use `total_analysed` as the denominator, not `total_sessions`. |
| No `task_status` filter | Presence of a `ticket_id` row in `feedback_complete_analyzed` is sufficient to confirm the eval job ran. No additional completion flag is required. |
| `DATE(created_at)` for date logic | `created_at` is the true session timestamp. `dl_last_updated` is infrastructure-only and must not influence business date logic. |

---

## 10. Metrics Reference — Exact Definitions & Formulas

> **Core principle:** All analytics are SESSION-LEVEL. Every metric must be
> computed after aggregating data at `session_id` (`support_ticket_details.id`).
> Never compute metrics at message-level or raw row-level.

---

### 10.1 Session Classification

Before any metric can be calculated, sessions must be classified using the
**user message count** derived from `ticket_session_conversation_snapshot_v3`.

#### User Message Count

```sql
COUNT(DISTINCT CASE
    WHEN m.role = '1'
    AND m.content NOT LIKE '%CTA has been shown to the user%'
    THEN m.message_id
END) AS user_msg
```

- `role = '1'` → user message
- `role = '2'` → assistant/bot message
- Rows where `content LIKE '%CTA has been shown to the user%'` are **system-generated**
  events incorrectly tagged as `role = '1'`. They must always be excluded — they
  are not real user messages.

#### Assistant Message Count (reference only)

```sql
COUNT(DISTINCT CASE WHEN m.role = '2' THEN m.message_id END) AS assis_msg
```

#### Session Type Classification

| Type | Condition | Meaning |
|------|-----------|---------|
| **Active Session** | `user_msg >= 1` | User sent at least one real message |
| **Bounced Session** | `user_msg = 0` | User opened the bot but never engaged |

The `grouped_sess` CTE (see §8) computes both counts at session level and is the
canonical source for `user_msg` in all downstream metric calculations.

---

### 10.2 Base Count Metrics

These are the foundation for all other metrics. Always compute from `session_data`
LEFT JOINed with `grouped_sess`.

| Metric | Formula | Notes |
|--------|---------|-------|
| **Total Sessions** | `COUNT(DISTINCT s.id)` | All sessions in the date/entity scope, including bounced |
| **Active Sessions** | `COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)` | Users who engaged |
| **Bounced Sessions** | `COUNT(DISTINCT CASE WHEN g.user_msg = 0 THEN s.id END)` | Users who dropped off immediately |

```sql
-- Example: base counts
SELECT
    COUNT(DISTINCT s.id)                                              AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)          AS active_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg = 0  THEN s.id END)          AS bounced_sessions
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
```

---

### 10.3 Engagement Metrics

| Metric | Formula | Denominator |
|--------|---------|-------------|
| **Bounce Rate** | `bounced_sessions * 1.0 / NULLIF(total_sessions, 0)` | Total Sessions |
| **Active Rate** | `active_sessions * 1.0 / NULLIF(total_sessions, 0)` | Total Sessions |

> **Denominator rule:** Bounce Rate and Active Rate are the **only** metrics that
> use Total Sessions as the denominator. All other quality/performance metrics use
> Active Sessions.

```sql
-- Example: engagement rates
SELECT
    COUNT(DISTINCT s.id)                                              AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)          AS active_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg = 0  THEN s.id END)          AS bounced_sessions,
    ROUND(
        COUNT(DISTINCT CASE WHEN g.user_msg = 0 THEN s.id END) * 1.0
        / NULLIF(COUNT(DISTINCT s.id), 0), 4
    )                                                                  AS bounce_rate,
    ROUND(
        COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END) * 1.0
        / NULLIF(COUNT(DISTINCT s.id), 0), 4
    )                                                                  AS active_rate
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
```

---

### 10.4 Evaluation Metrics

The eval job runs D+1 (next morning) for sessions from the previous day. Not all
active sessions will have an eval row — the eval job may fail or be delayed.

#### 10.4.1 Analyzed Sessions

```
Definition : Sessions that have a corresponding row in feedback_complete_analyzed
Formula    : COUNT(DISTINCT s.id WHERE f.ticket_id IS NOT NULL)
Signal     : Presence of row in the eval table = session was analyzed
```

**Important:** Do NOT require `out_key_problem_desc IS NOT NULL` to define
"analyzed". A session is analyzed as long as `f.ticket_id IS NOT NULL`.

#### 10.4.2 Eval Coverage

```
Definition : Analyzed sessions that also have a valid (non-null, non-zero) eval_score
Formula    : COUNT(DISTINCT s.id WHERE f.eval_score IS NOT NULL AND f.eval_score != 0)
```

#### 10.4.3 Rates

| Metric | Formula | Denominator |
|--------|---------|-------------|
| **Analyzed Rate** | `analyzed_sessions / NULLIF(active_sessions, 0)` | Active Sessions |
| **Eval Coverage Rate** | `valid_eval_sessions / NULLIF(active_sessions, 0)` | Active Sessions |

```sql
-- Example: eval metrics
SELECT
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)           AS active_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1
        AND f.ticket_id IS NOT NULL THEN s.id END)                     AS analyzed_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1
        AND f.eval_score IS NOT NULL
        AND f.eval_score != 0 THEN s.id END)                           AS eval_coverage_sessions,
    ROUND(
        COUNT(DISTINCT CASE WHEN g.user_msg >= 1 AND f.ticket_id IS NOT NULL THEN s.id END) * 1.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 4
    )                                                                   AS analyzed_rate,
    ROUND(
        COUNT(DISTINCT CASE WHEN g.user_msg >= 1 AND f.eval_score IS NOT NULL AND f.eval_score != 0 THEN s.id END) * 1.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 4
    )                                                                   AS eval_coverage_rate
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN feedback f     ON s.id = f.ticket_id
```

---

### 10.5 Escalation Metrics

A session is escalated when the bot creates a DevRev ticket (i.e., a human agent
is handed the conversation).

#### 10.5.1 Escalated Sessions

```
Definition : Sessions with a corresponding row in the DevRev table where fd_ticket_id IS NOT NULL
Formula    : COUNT(DISTINCT s.id WHERE d.fd_ticket_id IS NOT NULL)
```

#### 10.5.2 Escalation Rate

```
Formula    : escalated_sessions / NULLIF(active_sessions, 0)
Denominator: Active Sessions (NOT total sessions)
```

> Escalation = bot could not resolve; handed off to human. Bounced sessions cannot
> be escalated (user never engaged), so active sessions is the correct denominator.

```sql
-- Example: escalation metrics
SELECT
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)               AS active_sessions,
    COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END)    AS escalated_sessions,
    ROUND(
        COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 1.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 4
    )                                                                       AS escalation_rate
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN devrev d       ON s.id = d.id
```

---

### 10.6 MSAT Metrics

MSAT (Customer Satisfaction) is captured in `ticket_meta_snapshot_v3` via
`feedback_status`. Values: `'2'` = Happy, `'3'` = Sad, `'4'` = Skip, NULL = no
response.

| Metric | Formula | Denominator |
|--------|---------|-------------|
| **Happy Count** | `COUNT(DISTINCT s.id WHERE z.feedback_status = 'Happy')` | Active Sessions |
| **Sad Count** | `COUNT(DISTINCT s.id WHERE z.feedback_status = 'Sad')` | Active Sessions |
| **MSAT Response Rate** | `(happy + sad) / NULLIF(active_sessions, 0)` | Active Sessions |
| **MSAT Score** | `happy / NULLIF(happy + sad, 0)` | Happy + Sad only (exclude Skip/NULL) |

```sql
-- Example: MSAT
SELECT
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                AS active_sessions,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Happy' THEN s.id END)    AS happy,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Sad'   THEN s.id END)    AS sad,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Skip'  THEN s.id END)    AS skipped,
    ROUND(
        COUNT(DISTINCT CASE WHEN z.feedback_status = 'Happy' THEN s.id END) * 1.0
        / NULLIF(
            COUNT(DISTINCT CASE WHEN z.feedback_status IN ('Happy','Sad') THEN s.id END)
          , 0), 4
    )                                                                        AS msat_score
FROM session_data s
LEFT JOIN grouped_sess    g ON s.id = g.ticket_id
LEFT JOIN feedback_status z ON s.id = z.ticket_id
```

---

### 10.7 The Metric Funnel (Logical Reference)

```
Total Sessions
  └─ Active Sessions          (user_msg >= 1)
       └─ Analyzed Sessions   (f.ticket_id IS NOT NULL)
            └─ Eval Coverage  (eval_score IS NOT NULL AND != 0)
       └─ Escalated Sessions  (d.fd_ticket_id IS NOT NULL)
       └─ MSAT Respondents    (feedback_status IN ('Happy','Sad'))
```

**Critical:** This funnel is **logical only**. Do NOT enforce these as global
WHERE filters. Each query should include only the filters relevant to the
specific question being answered.

---

### 10.8 L1 / L2 Issue Analytics

L1 (`out_key_problem_desc`) and L2 (`out_key_problem_sub_desc`) come from the
eval table. Use these only for issue-level analysis, never to identify a vertical.

**Valid tag filter** — always apply when displaying L1/L2 breakdowns:
```sql
WHERE f.out_key_problem_desc IS NOT NULL
  AND f.out_key_problem_desc NOT IN ('Others', '', ' ', 'NA', 'None')
```

**Denominator for L1/L2 %:** Use `analyzed_sessions` (sessions where eval ran),
not `total_sessions` or `active_sessions`. Sessions without eval rows are
excluded from the denominator.

```sql
-- Example: top L1 issues with % of analyzed sessions
-- Step 1: pre-compute denominator in a CTE (NEVER use OVER() with GROUP BY)
totals AS (
    SELECT COUNT(DISTINCT s.id) AS total_analyzed
    FROM session_data s
    JOIN grouped_sess g ON s.id = g.ticket_id
    JOIN feedback f     ON s.id = f.ticket_id
    WHERE g.user_msg >= 1
      AND f.out_key_problem_desc IS NOT NULL
      AND f.out_key_problem_desc NOT IN ('Others', '', ' ', 'NA', 'None')
)
-- Step 2: grouped query CROSS JOINs the total
SELECT
    f.out_key_problem_desc                                                   AS issue_category,
    COUNT(DISTINCT s.id)                                                     AS session_count,
    ROUND(COUNT(DISTINCT s.id) * 1.0 / NULLIF(t.total_analyzed, 0), 4)     AS pct_of_analyzed
FROM session_data s
INNER JOIN feedback f     ON s.id = f.ticket_id
LEFT JOIN  grouped_sess g ON s.id = g.ticket_id
CROSS JOIN totals t
WHERE g.user_msg >= 1
  AND f.out_key_problem_desc IS NOT NULL
  AND f.out_key_problem_desc NOT IN ('Others', '', ' ', 'NA', 'None')
GROUP BY 1, t.total_analyzed
ORDER BY 2 DESC
```

---

## 11. Query Construction Principles

### 11.1 Always Start From Session Table

Every query **must** begin from `support_ticket_details_snapshot_v3` (the
`session_data` CTE). Never start from the eval, devrev, or meta table.

### 11.2 Modular Query Design — Only Include What You Need

| Question type | CTEs / joins to include |
|---------------|-------------------------|
| Session counts only | `session_data` |
| Active / bounce counts or rates | `session_data` + `grouped_sess` |
| Issue categories, tone, L1/L2 | `session_data` + `grouped_sess` + `feedback` |
| Eval score, metrics_json fields | `session_data` + `grouped_sess` + `feedback` |
| Agent escalation / handover | `session_data` + `grouped_sess` + `devrev` |
| MSAT (Happy/Sad/Skip) | `session_data` + `grouped_sess` + `feedback_status` |
| Transcript / message content | `session_data` + `messages_data` |
| Workflow / intent / plugin data | `session_data` + `vertical_analytics` |
| Full funnel (all metrics at once) | All CTEs via `final1` pattern |

Do NOT include all tables for every query. Join only what the question requires.

### 11.3 Aggregation Order

Always:
1. Aggregate raw messages → session level (in `grouped_sess` CTE)
2. Join session-level aggregates together (in `final1` or final SELECT)
3. Apply filters and compute metrics

Never filter at the raw message level and then count sessions from the result.

### 11.4 Filter Application Rules

**`user_msg >= 1` must NEVER be a global WHERE filter.** Use it only inline inside
`COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)` for the `active_sessions`
metric. All other metrics must remain unfiltered at the query level so that
`total_sessions` counts all sessions including bounced.

| Filter | Where to apply | Where NOT to apply |
|--------|----------------|--------------------|
| `g.user_msg >= 1` | Inline in `active_sessions` CASE WHEN only | Never as a global WHERE clause |
| `f.ticket_id IS NOT NULL` | Inline in `analyzed_sessions` CASE WHEN | Not needed alongside escalation or other eval checks |
| `d.fd_ticket_id IS NOT NULL` | Inline in `escalated_sessions` CASE WHEN | Never combined with `user_msg >= 1` (redundant) |
| `f.out_key_problem_desc IS NOT NULL AND NOT IN ('Others',...)` | In L1/L2 breakdown queries only | Not in funnel/count queries |

**Implicit activity rule:** If `f.ticket_id IS NOT NULL` or `d.fd_ticket_id IS NOT NULL`,
the session was definitionally active. Do not add `AND g.user_msg >= 1` alongside
these — it is redundant and adds unnecessary join dependency.

### 11.5 Denominator Rules

| Metric category | Denominator |
|-----------------|-------------|
| Bounce Rate, Active Rate | **Total Sessions** |
| Analyzed Rate, Eval Coverage Rate | **Active Sessions** |
| Escalation Rate | **Active Sessions** |
| MSAT Score | **Happy + Sad only** (exclude Skip and NULL) |
| MSAT Response Rate | **Active Sessions** |
| L1/L2 percentages | **Analyzed Sessions** (sessions with eval row) |

Always wrap denominators in `NULLIF(..., 0)` to prevent division-by-zero errors.

### 11.6 Eval Table Rules (Repeated for Emphasis)

- `feedback_complete_analyzed.created_at` is the eval job run timestamp (D+1), NOT the session date.
- Never filter or group by `created_at` on the eval table.
- Date scoping for eval rows is handled entirely by the `ticket_id → session.id` JOIN.
- Presence of a row in the eval table = session was analyzed. No additional `task_status` check needed.

### 11.7 Scope Sub-Tables to `session_data` Using `IN` Subquery

When querying `ticket_session_conversation_snapshot_v3` or
`feedback_complete_analyzed_data_snapshot_v3`, always scope them to the sessions
already selected in `session_data` using an `IN` subquery. This avoids full table
scans and keeps the CTE output small.

```sql
messages_data AS (
    SELECT ticket_id, message_id, role, content
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)   -- ← scope to relevant sessions
),
feedback AS (
    SELECT ticket_id, eval_score, out_key_problem_desc
    FROM hive.mhd_crm_cst.feedback_complete_analyzed_data_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)   -- ← scope to relevant sessions
)
```

### 11.8 DevRev Join Rule

```sql
-- Always join on id = id (not ticket_id)
LEFT JOIN devrev d ON s.id = d.id
-- Escalation signal — use inline, never as global WHERE:
COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) AS escalated_sessions
```

---

## 12. Output Formatting Rules — Always Follow

These rules apply to every query the LLM generates, regardless of what the user
asks for. They ensure consistent, human-readable output.

### 12.1 Percentages — Always Multiply by 100.0

All rate and percentage columns must be expressed in the **0–100 range**, not 0–1.
Always use `* 100.0` (not `* 1.0`) in the calculation.

```sql
-- ❌ WRONG — outputs 0.4523, not human-readable
ROUND(COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 1.0
    / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS escalation_rate

-- ✅ CORRECT — outputs 45.23
ROUND(COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS escalation_pct
```

Name the column with a `_pct` suffix when it is a percentage (e.g. `escalation_pct`,
`bounce_pct`, `analyzed_pct`) to make the unit obvious in the output table.

### 12.2 Score Columns — Always Express in 0–100 Range

`eval_score`, `empathy_score`, `resolution_achieved`, `response_relevance_score`,
`sentiment_net_change`, and all other score fields from `metrics_json` are stored
as decimals in the **0–1 range**. Multiply by 100 when displaying.

```sql
-- ❌ WRONG — outputs 0.7823
ROUND(AVG(TRY_CAST(eval_score AS DOUBLE)), 2) AS avg_eval_score

-- ✅ CORRECT — outputs 78.23
ROUND(AVG(TRY_CAST(eval_score AS DOUBLE)) * 100.0, 2) AS avg_eval_score

-- ✅ CORRECT — for metrics_json fields
ROUND(AVG(TRY_CAST(json_extract_scalar(metrics_json, '$.empathy_score') AS DOUBLE)) * 100.0, 2) AS avg_empathy_score
```

### 12.3 Always Include Base Count Columns

Never return only derived metrics (rates, averages, percentages) without the
underlying counts. The user needs counts to judge significance.

**Required columns whenever a derived metric is shown:**

| Derived metric shown | Required count columns to also include |
|----------------------|----------------------------------------|
| `escalation_pct` | `active_sessions`, `escalated_sessions` |
| `analyzed_pct` / `avg_eval_score` | `active_sessions`, `analyzed_sessions` |
| `bounce_pct` | `total_sessions`, `bounced_sessions` |
| `msat_score` | `active_sessions`, `happy`, `sad` |
| L1/L2 `issue_pct` | `session_count`, `total_analyzed` |
| Any `avg_*` score | `active_sessions` (or the count of sessions in the average) |

```sql
-- ❌ WRONG — returns only derived metric, no context
SELECT session_date, avg_eval_score, escalation_pct
FROM final

-- ✅ CORRECT — includes base counts alongside derived metrics
SELECT session_date, active_sessions, escalated_sessions, escalation_pct,
       analyzed_sessions, avg_eval_score
FROM final
```

### 12.4 ROUND() Precision

| Column type | Decimal places |
|-------------|---------------|
| Percentages (`_pct`) | 2 |
| Score averages (`avg_*`) | 2 |
| Rates used internally (not displayed) | 4 |

---

## 13. Expected Query Types — Patterns & Templates

This section defines every common question type the HelpBot must handle, with the
exact CTE structure to use for each. When a user asks a question, match it to the
closest type here and use the corresponding pattern as the starting point.

---

### Type 1 — Session Funnel (counts + rates, no grouping)

**Trigger phrases:** "how many sessions", "total sessions", "active sessions",
"bounce rate", "how many were analyzed", "escalation rate", "overall stats"

**CTEs needed:** `session_data` + `messages_data` + `grouped_sess` + optionally
`feedback`, `devrev`, `feedback_status`

**Output columns:** `total_sessions`, `active_sessions`, `bounced_sessions`,
`bounce_pct`, `analyzed_sessions`, `analyzed_pct`, `escalated_sessions`,
`escalation_pct`

```sql
WITH session_data AS (...),
messages_data AS (...),
grouped_sess AS (...),
feedback AS (...),
devrev AS (...)
SELECT
    COUNT(DISTINCT s.id)                                                        AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                    AS active_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg = 0  THEN s.id END)                    AS bounced_sessions,
    ROUND(COUNT(DISTINCT CASE WHEN g.user_msg = 0 THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT s.id), 0), 2)                                  AS bounce_pct,
    COUNT(DISTINCT CASE WHEN f.ticket_id IS NOT NULL THEN s.id END)            AS analyzed_sessions,
    ROUND(COUNT(DISTINCT CASE WHEN f.ticket_id IS NOT NULL THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS analyzed_pct,
    COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END)         AS escalated_sessions,
    ROUND(COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS escalation_pct
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN feedback f     ON s.id = f.ticket_id
LEFT JOIN devrev d       ON s.id = d.id
```

---

### Type 2 — Daily Trend (any metric broken down by date)

**Trigger phrases:** "daily", "day-wise", "per day", "last N days trend",
"show me by date", "date-wise breakdown"

**CTEs needed:** same as Type 1 but final SELECT groups by `DATE(s.created_at)`

**Key rule:** Always `GROUP BY 1` on `DATE(s.created_at)`, `ORDER BY 1 DESC`

```sql
SELECT
    DATE(s.created_at)                                                          AS session_date,
    COUNT(DISTINCT s.id)                                                        AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                    AS active_sessions,
    COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END)         AS escalated_sessions,
    ROUND(COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS escalation_pct,
    COALESCE(ROUND(AVG(CASE WHEN f.eval_score IS NOT NULL THEN f.eval_score END) * 100.0, 2), 0) AS avg_eval_score
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN feedback f     ON s.id = f.ticket_id
LEFT JOIN devrev d       ON s.id = d.id
GROUP BY 1
ORDER BY 1 DESC
```

---

### Type 3 — L1 Issue Breakdown WITH Multiple Metrics Per Issue

**Trigger phrases:** "top issues", "top problems", "issue categories with...",
"breakdown by issue", "show issues with their session count / ticket count / eval score"

This is the most common complex query type. It groups by `out_key_problem_desc`
and computes multiple per-issue metrics. Requires a `totals` CTE for `%` columns.

**CTEs needed:** `session_data` + `messages_data` + `grouped_sess` + `feedback` +
optionally `devrev` + `totals`

```sql
WITH session_data AS (...),
messages_data AS (...),
grouped_sess AS (...),
feedback AS (
    SELECT ticket_id, out_key_problem_desc, out_key_problem_sub_desc,
           TRY_CAST(eval_score AS DOUBLE) AS eval_score
    FROM hive.{schema}.feedback_complete_analyzed_data_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)
),
devrev AS (...),
totals AS (
    -- Pre-compute denominator for % columns (NEVER use OVER() with GROUP BY)
    SELECT COUNT(DISTINCT s.id) AS total_analyzed
    FROM session_data s
    JOIN grouped_sess g ON s.id = g.ticket_id
    JOIN feedback f     ON s.id = f.ticket_id
    WHERE g.user_msg >= 1
      AND f.out_key_problem_desc IS NOT NULL
      AND f.out_key_problem_desc NOT IN ('Others', '', ' ', 'NA', 'None')
)
SELECT
    f.out_key_problem_desc                                                       AS issue_category,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                     AS active_sessions,
    COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END)          AS ticket_created,
    ROUND(COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END), 0), 2) AS ticket_creation_pct,
    COALESCE(ROUND(AVG(CASE WHEN f.eval_score IS NOT NULL THEN f.eval_score END) * 100.0, 2), 0) AS avg_eval_score,
    ROUND(COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END) * 100.0
        / NULLIF(t.total_analyzed, 0), 2)                                        AS pct_of_total
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
JOIN      feedback f     ON s.id = f.ticket_id
LEFT JOIN devrev d       ON s.id = d.id
CROSS JOIN totals t
WHERE f.out_key_problem_desc IS NOT NULL
  AND f.out_key_problem_desc NOT IN ('Others', '', ' ', 'NA', 'None')
GROUP BY 1, t.total_analyzed
ORDER BY 2 DESC
LIMIT 10
```

---

### Type 4 — Entity Comparison (multiple entities side by side)

**Trigger phrases:** "compare entities", "entity-wise", "across verticals",
"settlement vs device", "all MHD entities"

**Key rule:** Remove the `cst_entity = '...'` filter from `session_data`, add it
to the SELECT and GROUP BY instead.

```sql
session_data AS (
    SELECT id, created_at, cst_entity
    FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      -- NO entity filter here — comparing all entities
),
...
SELECT
    s.cst_entity,
    COUNT(DISTINCT s.id)                                            AS total_sessions,
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)        AS active_sessions,
    ...
GROUP BY 1
ORDER BY 2 DESC
```

---

### Type 5 — MSAT / Feedback Satisfaction

**Trigger phrases:** "MSAT", "happy/sad", "customer satisfaction", "feedback score",
"how many were happy", "satisfaction rate"

**CTEs needed:** `session_data` + `messages_data` + `grouped_sess` + `feedback_status`

```sql
feedback_status AS (
    SELECT DISTINCT ticket_id,
        CASE
            WHEN feedback_status = '2' THEN 'Happy'
            WHEN feedback_status = '3' THEN 'Sad'
            WHEN feedback_status = '4' THEN 'Skip'
            ELSE 'NULL'
        END AS feedback_status
    FROM hive.{schema}.ticket_meta_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)
)
SELECT
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                    AS active_sessions,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Happy' THEN s.id END)        AS happy,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Sad'   THEN s.id END)        AS sad,
    COUNT(DISTINCT CASE WHEN z.feedback_status = 'Skip'  THEN s.id END)        AS skipped,
    ROUND(COUNT(DISTINCT CASE WHEN z.feedback_status = 'Happy' THEN s.id END) * 100.0
        / NULLIF(COUNT(DISTINCT CASE WHEN z.feedback_status IN ('Happy','Sad') THEN s.id END), 0), 2) AS msat_score
FROM session_data s
LEFT JOIN grouped_sess    g ON s.id = g.ticket_id
LEFT JOIN feedback_status z ON s.id = z.ticket_id
```

---

### Type 6 — Eval Quality Metrics (scores from metrics_json)

**Trigger phrases:** "eval score", "empathy score", "resolution rate",
"response relevance", "quality metrics", "bot quality"

**CTEs needed:** `session_data` + `messages_data` + `grouped_sess` + `feedback`

Always use `TRY_CAST`, multiply by `100.0`, and `COALESCE(..., 0)`:

```sql
feedback AS (
    SELECT ticket_id,
           TRY_CAST(eval_score AS DOUBLE) AS eval_score,
           TRY_CAST(json_extract_scalar(metrics_json, '$.empathy_score') AS DOUBLE)            AS empathy_score,
           TRY_CAST(json_extract_scalar(metrics_json, '$.resolution_achieved') AS DOUBLE)      AS resolution_achieved,
           TRY_CAST(json_extract_scalar(metrics_json, '$.response_relevance_score') AS DOUBLE) AS response_relevance_score
    FROM hive.{schema}.feedback_complete_analyzed_data_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND ticket_id IN (SELECT id FROM session_data)
)
SELECT
    COUNT(DISTINCT CASE WHEN g.user_msg >= 1 THEN s.id END)                     AS active_sessions,
    COUNT(DISTINCT CASE WHEN f.ticket_id IS NOT NULL THEN s.id END)             AS analyzed_sessions,
    COALESCE(ROUND(AVG(f.eval_score)              * 100.0, 2), 0)               AS avg_eval_score,
    COALESCE(ROUND(AVG(f.empathy_score)           * 100.0, 2), 0)               AS avg_empathy_score,
    COALESCE(ROUND(AVG(f.resolution_achieved)     * 100.0, 2), 0)               AS avg_resolution_rate,
    COALESCE(ROUND(AVG(f.response_relevance_score)* 100.0, 2), 0)               AS avg_response_relevance
FROM session_data s
LEFT JOIN grouped_sess g ON s.id = g.ticket_id
LEFT JOIN feedback f     ON s.id = f.ticket_id
```

---

### Type 7 — Merchant ID (MID) Lookup

**Trigger phrases:** "sessions for MID", "merchant ID", "for merchant X",
"show me sessions for 12345678"

**CTEs needed:** `session_data` (filtered by `merchant_id`) — no other CTEs needed
unless specific metrics asked for

```sql
session_data AS (
    SELECT id, created_at, cst_entity, merchant_id
    FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      AND merchant_id = '{mid}'           -- MID filter goes here
)
```

---

### Type 8 — Combined Multi-Metric Report (Type 1 + Type 3 together)

**Trigger phrases:** "full report", "give me everything", "top issues with their
sessions, ticket count, % and eval score"

This is the query type that failed in the screenshot above. It combines issue-level
grouping (Type 3) with multiple metrics. Always use the Type 3 template exactly —
the `totals` CTE + `CROSS JOIN` is mandatory.

**The model must NOT try to compute percentages using window functions here.**
Use the `totals` CTE pattern and include `t.total_analyzed` in `GROUP BY`.

---

## 9. Open Items / To Be Documented

- [ ] `plugservice_response` unwrapping pattern per vertical (exact JSON structure varies — needs per-vertical examples)
- [ ] `metrics_json` field structure from eval job — full list of keys, value ranges, and meaning
- [ ] Campaign tables (`trino_campaigns.py`) — separate section needed
- [ ] Bounce rate by entity — exact figures for MHD and CST (estimated 35–55%)
- [ ] Full list of system message patterns excluded from `user_msg` count (currently only `'CTA has been shown to the user%'` is known)
- [ ] Best approach for attributing a session to its "primary" entity when the user touched multiple entities (first vs dominant vs last from `vertical_analytics`)
- [ ] Additional metrics to document: resolution rate (from `metrics_json.resolution_achieved`), empathy score, response relevance score, sentiment net change — exact formulas once confirmed
- [ ] MSAT response rate benchmarks by entity
