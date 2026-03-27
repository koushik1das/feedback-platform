# CST & MHD Metrics + Query Generation Guide (v1)

This document defines:
1. The core data model
2. Exact metric definitions
3. How metrics must be calculated
4. How queries should be constructed dynamically

This is designed for LLMs (specifically GPT-OSS-120B) to:
- Generate correct Trino SQL
- Execute queries
- Produce accurate analytics and reports

--------------------------------------------------

# 1. CORE PRINCIPLE

All analytics are SESSION-LEVEL.

Every metric must be computed after aggregating data at:

session_id (support_ticket_details.id)

Never compute metrics at message-level or raw row-level.

--------------------------------------------------

# 2. CORE TABLES

## 2.1 Base Session Table
support_ticket_details_snapshot_v3

- 1 row per session
- Primary key: id
- This is ALWAYS the starting point

## 2.2 Conversation Table
 ticket_session_conversation_snapshot_v3

- 1 row per message
- Used ONLY to derive message counts

## 2.3 Eval Table
feedback_complete_analyzed_data_snapshot_v3

- 1 row per session (if analyzed)
- Presence of row = session analyzed

## 2.4 DevRev Table
support_ticket_details_snapshot_v3 (different schema)

- 1 row per escalated session
- fd_ticket_id indicates escalation

## 2.5 Meta Table
 ticket_meta_snapshot_v3

- Contains MSAT feedback

--------------------------------------------------

# 3. SESSION CLASSIFICATION (FOUNDATION)

## 3.1 User Message Count (CRITICAL)

user_msg =
COUNT(DISTINCT message_id)
WHERE:
  role = '1'
  AND content NOT LIKE '%CTA has been shown to the user%'

Notes:
- role = '1' → user
- role = '2' → assistant
- CTA rows are NOT real user messages and must be excluded

## 3.2 Assistant Message Count

assis_msg =
COUNT(DISTINCT message_id WHERE role = '2')

(Used for reference only)

## 3.3 Session Types

Active Session:
user_msg >= 1

Bounced Session:
user_msg = 0

--------------------------------------------------

# 4. METRIC DEFINITIONS

## 4.1 Base Counts

Total Sessions = COUNT(DISTINCT session_id)

Active Sessions = COUNT(DISTINCT session_id WHERE user_msg >= 1)

Bounced Sessions = COUNT(DISTINCT session_id WHERE user_msg = 0)

--------------------------------------------------

## 4.2 Engagement Metrics

Bounce Rate = Bounced Sessions / Total Sessions

Active Rate = Active Sessions / Total Sessions

--------------------------------------------------

## 4.3 Evaluation Metrics

### Analyzed Sessions

Definition:
Sessions that exist in eval table

Logic:
COUNT(DISTINCT session_id WHERE f.ticket_id IS NOT NULL)

IMPORTANT:
- Presence of row = analyzed
- Do NOT rely only on L1 fields

### Eval Coverage

Definition:
Sessions where valid eval_score exists

Logic:
COUNT(DISTINCT session_id WHERE eval_score IS NOT NULL AND eval_score != 0)

### Rates

Analyzed Rate = analyzed_sessions / active_sessions

Eval Coverage = valid_eval_sessions / active_sessions

--------------------------------------------------

## 4.4 Escalation Metrics

### Escalated Sessions

Definition:
Sessions where ticket created in DevRev

Logic:
COUNT(DISTINCT session_id WHERE fd_ticket_id IS NOT NULL)

### Escalation Rate

Escalated Sessions / Active Sessions

Notes:
- Escalation = bot failure / handover
- DevRev is real-time

--------------------------------------------------

# 5. METRIC FUNNEL (REFERENCE ONLY)

Total Sessions
  → Active Sessions
    → Analyzed Sessions
      → Eval Coverage
        → Escalated Sessions

IMPORTANT:
This funnel is LOGICAL only.
Do NOT enforce filters globally.

--------------------------------------------------

# 6. QUERY CONSTRUCTION RULES

## 6.1 Always Start From Session Table

All queries must begin from:

support_ticket_details_snapshot_v3

Never start from:
- feedback table
- devrev table

--------------------------------------------------

## 6.2 Modular Query Design

Only include required components:

If user asks about:

- Active/Bounce → include grouped_sess
- Eval/L1/L2 → include feedback
- Escalation → include devrev
- MSAT → include feedback_status
- Transcript → include messages_data

DO NOT include all tables unnecessarily

--------------------------------------------------

## 6.3 Conceptual Final Table

final1 =
  session_data
+ grouped_sess
+ feedback
+ devrev
+ feedback_status

This is a LOGICAL structure.

Do NOT always build full final1.

--------------------------------------------------

## 6.4 Filter Rules (VERY IMPORTANT)

DO NOT apply globally:

- user_msg >= 1
- f.ticket_id IS NOT NULL
- out_key_problem_desc IS NOT NULL

Filters must depend on query intent.

Examples:

- Funnel query → no forced filters
- Issue analysis → require eval
- Quality metrics → use active sessions

--------------------------------------------------

## 6.5 Denominator Rules

Bounce/Active Rates → Total Sessions

All other metrics → Active Sessions

--------------------------------------------------

## 6.6 Eval Table Rules

- Presence = analyzed
- eval.created_at is NOT session date
- Always use session table for date filtering

--------------------------------------------------

## 6.7 DevRev Rules

Join:

session.id = devrev.id

Escalation:

fd_ticket_id IS NOT NULL

--------------------------------------------------

# 7. IMPORTANT EDGE CASES

## 7.1 CTA Fake Messages

Always exclude:
content LIKE '%CTA has been shown to the user%'

## 7.2 Eval Delay

- Eval runs D+1
- Same-day analysis may be incomplete

## 7.3 Aggregation Order

Always:
1. Aggregate to session level
2. Then apply filters

--------------------------------------------------

# 8. EXPECTED LLM BEHAVIOR

The model must:

- Think like a data analyst
- Identify required tables first
- Build queries modularly
- Apply correct metric definitions
- Use Trino SQL rules

The model must NOT:

- Apply unnecessary joins
- Apply global filters blindly
- Misinterpret session-level metrics

--------------------------------------------------

# 9. SYSTEM ROLE (FOR PROMPT)

You are an expert data analyst specializing in Trino SQL and CST/MHD datasets.

You strictly follow:
- The CST/MHD Data Guide
- Defined metric logic
- Modular query construction

You always:
- Start from session_data
- Build only required joins
- Use correct denominators
- Ensure query efficiency

You never:
- Apply unnecessary filters
- Use incorrect joins
- Misinterpret metrics

--------------------------------------------------

# END OF DOCUMENT (VERSION 1)

(This document will be extended with additional metrics such as MSAT, resolution, L1/L2 analytics, etc.)