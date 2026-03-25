--- MHD Master Query ---

WITH session_data AS (
    SELECT DISTINCT id, created_at, merchant_id, cst_entity
    FROM "hive"."mhd_crm_cst"."support_ticket_details_snapshot_v3" a
    WHERE a.dl_last_updated >= DATE '2026-01-01'
    AND DATE(a.created_at) >= DATE '2026-01-01'
),

messages_data AS (
    SELECT DISTINCT ticket_id, message_id, content, role, type
    FROM "hive"."mhd_crm_cst"."ticket_session_conversation_snapshot_v3" t
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    AND ticket_id IN (SELECT DISTINCT id AS ticket_id FROM session_data)
),

grouped_sess as (
    SELECT
        s.id AS ticket_id,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '2' THEN message_id END), 0) AS assis_msg,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '1' AND m.content NOT LIKE '%CTA has been shown to the user%' THEN message_id END), 0) AS user_msg
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
),

feedback_status AS (
    SELECT DISTINCT
        ticket_id,
        CASE
            WHEN feedback_status = '2' THEN 'Happy'
            WHEN feedback_status = '3' THEN 'Sad'
            WHEN feedback_status = '4' THEN 'Skip'
            WHEN (feedback_status IS NULL OR feedback_status = 'NA') THEN 'NULL'
        END AS feedback_status
    FROM "hive"."mhd_crm_cst"."ticket_meta_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    GROUP BY 1, 2
),

feedback AS (
    SELECT DISTINCT
        ticket_id, cst_entity, eval_score,
        out_key_problem_desc, -- L1
        out_key_problem_sub_desc, -- L2
        metrics_json
    FROM "hive"."mhd_crm_cst"."feedback_complete_analyzed_data_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
),

vertical AS (
    SELECT
        vertical_created_at, vertical_ticket_id, vertical_msg_id,
        vertical_cst_entity, workflow, intent
        --plugservice_response, plugservice_request
    FROM (
        SELECT DISTINCT
            created_at AS vertical_created_at, ticket_id AS vertical_ticket_id, message_id AS vertical_msg_id,
            cst_entity AS vertical_cst_entity, workflow, intent, plugservice_response, plugservice_request
        FROM "hive"."mhd_crm_cst"."vertical_analytics_data_snapshot_v3"
        WHERE dl_last_updated >= DATE '2026-01-01'
        AND DATE(created_at) >= DATE '2026-01-01'
    ) sub
),

devrev AS (
    SELECT DISTINCT
        id, fd_ticket_id, cst_entity AS devrev_cst_entity
    FROM "hive"."mhd_cst_ticket"."support_ticket_details_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    GROUP BY 1, 2, 3
),

final1 AS (
    SELECT
      y.id AS session_id, y.created_at, y.merchant_id, d.fd_ticket_id,
      y.cst_entity, a.content AS transcript, z.feedback_status, f.eval_score, 
      f.out_key_problem_desc, f.out_key_problem_sub_desc, f.metrics_json,
      g.user_msg, g.assis_msg
    FROM session_data y -- base table with merchant bot sessions
    LEFT JOIN (SELECT DISTINCT ticket_id, content FROM messages_data WHERE type = 'TRANSCRIPT') a ON y.id = a.ticket_id -- conversation dump
    --LEFT JOIN vertical b ON a.message_id = b.vertical_msg_id -- master data
    LEFT JOIN feedback_status z ON y.id = z.ticket_id -- merchant satisfaction feedback
    LEFT JOIN feedback f ON y.id = f.ticket_id -- eval score, L1, L2 tags
    LEFT JOIN grouped_sess g ON y.id = g.ticket_id -- session level message count
    LEFT JOIN devrev d ON y.id = d.id -- ticket created from bot (if present)
)

SELECT *
FROM final1
--WHERE out_key_problem_desc IS NOT NULL AND out_key_problem_desc NOT IN ('Others', '', ' ')
ORDER BY created_at DESC, session_id

--- CST Master Query ---

WITH session_data AS (
    SELECT DISTINCT id, created_at, customer_id, cst_entity
    FROM "hive"."crm_cst"."support_ticket_details_snapshot_v3" a
    WHERE a.dl_last_updated >= DATE '2026-01-01'
    AND DATE(a.created_at) >= DATE '2026-01-01'
),

messages_data AS (
    SELECT DISTINCT ticket_id, message_id, content, role, type
    FROM "hive"."crm_cst"."ticket_session_conversation_snapshot_v3" t
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    AND ticket_id IN (SELECT DISTINCT id AS ticket_id FROM session_data)
),

grouped_sess as (
    SELECT
        s.id AS ticket_id,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '2' THEN message_id END), 0) AS assis_msg,
        COALESCE(COUNT(DISTINCT CASE WHEN m.role = '1' AND m.content NOT LIKE '%CTA has been shown to the user%' THEN message_id END), 0) AS user_msg
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
),

feedback_status AS (
    SELECT DISTINCT
        ticket_id,
        CASE
            WHEN feedback_status = '2' THEN 'Happy'
            WHEN feedback_status = '3' THEN 'Sad'
            WHEN feedback_status = '4' THEN 'Skip'
            WHEN (feedback_status IS NULL OR feedback_status = 'NA') THEN 'NULL'
        END AS feedback_status
    FROM "hive"."crm_cst"."ticket_meta_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    GROUP BY 1, 2
),

feedback AS (
    SELECT DISTINCT
        ticket_id, cst_entity, eval_score,
        out_key_problem_desc, -- L1
        out_key_problem_sub_desc, -- L2
        metrics_json
    FROM "hive"."crm_cst"."feedback_complete_analyzed_data_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
),

vertical AS (
    SELECT
        vertical_created_at, vertical_ticket_id, vertical_msg_id,
        vertical_cst_entity, workflow, intent
        --plugservice_response, plugservice_request
    FROM (
        SELECT DISTINCT
            created_at AS vertical_created_at, ticket_id AS vertical_ticket_id, message_id AS vertical_msg_id,
            cst_entity AS vertical_cst_entity, workflow, intent, plugservice_response, plugservice_request
        FROM "hive"."crm_cst"."vertical_analytics_data_snapshot_v3"
        WHERE dl_last_updated >= DATE '2026-01-01'
        AND DATE(created_at) >= DATE '2026-01-01'
    ) sub
),

devrev AS (
    SELECT DISTINCT
        id, fd_ticket_id, cst_entity AS devrev_cst_entity
    FROM "hive"."cst_ticket"."support_ticket_details_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    GROUP BY 1, 2, 3
),

final1 AS (
    SELECT
      y.id AS session_id, y.created_at, y.customer_id, d.fd_ticket_id,
      y.cst_entity, a.content AS transcript, z.feedback_status, f.eval_score, 
      f.out_key_problem_desc, f.out_key_problem_sub_desc, f.metrics_json,
      g.user_msg, g.assis_msg
    FROM session_data y -- base table with customer bot sessions
    LEFT JOIN (SELECT DISTINCT ticket_id, content FROM messages_data WHERE type = 'TRANSCRIPT') a ON y.id = a.ticket_id -- conversation dump
    --LEFT JOIN vertical b ON a.message_id = b.vertical_msg_id -- master data
    LEFT JOIN feedback_status z ON y.id = z.ticket_id -- customer satisfaction feedback
    LEFT JOIN feedback f ON y.id = f.ticket_id -- eval score, L1, L2 tags
    LEFT JOIN grouped_sess g ON y.id = g.ticket_id -- session level message count
    LEFT JOIN devrev d ON y.id = d.id -- ticket created from bot (if present)
)

SELECT *
FROM final1
--WHERE out_key_problem_desc IS NOT NULL AND out_key_problem_desc NOT IN ('Others', '', ' ')
ORDER BY created_at DESC, session_id;

