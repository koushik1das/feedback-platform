--- MHD Master Query ---

WITH session_data AS (
    SELECT DISTINCT id, created_at, merchant_id, cst_entity
    FROM "hive"."mhd_crm_cst"."support_ticket_details_snapshot_v3" a
    WHERE a.dl_last_updated >= DATE '2026-01-01'
    AND DATE(a.created_at) >= DATE '2026-01-01'
    AND a.id NOT LIKE '2-%'
    AND a.source = 100
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
    AND a.id NOT LIKE '2-%'
    AND a.source = 100
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

--- MHD Function Call Success Rate ---
-- CRITICAL: plugservice_response unwrap uses SINGLE backslash '\' in REPLACE and '\['/'\{' in REGEXP_REPLACE.
-- Using double backslash '\\' silently breaks JSON parsing → all _status columns return NULL → all success counts = 0.
-- vertical CTE MUST use an inner sub subquery + GROUP BY to avoid duplicate rows inflating counts.

WITH session_data AS (
    SELECT
        id, merchant_id,
        created_at,
        fd_ticket_id, cst_entity
    FROM "hive"."mhd_crm_cst"."support_ticket_details_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND DATE(created_at) >= DATE '2026-01-01'
    AND id NOT LIKE '2-%'
    AND source = 100
    GROUP BY 1, 2, 3, 4, 5
),

messages_data AS (
    SELECT 
        ticket_id,
        message_id,
        role, meta,
        
        json_extract_scalar(meta, '$.intent') AS intent,
        COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel,
        json_extract_scalar(meta, '$.expPrompt') AS expPrompt,
        REGEXP_REPLACE(JSON_EXTRACT_SCALAR(content, '$.content'), '\\.', '') AS content
    FROM "hive"."mhd_crm_cst"."ticket_session_conversation_snapshot_v3"
    WHERE dl_last_updated >= DATE '2026-01-01'
    AND ticket_id IN (SELECT DISTINCT id FROM session_data)
),

grouped_sess AS (
    SELECT
        s.id,
        COUNT(DISTINCT CASE WHEN m.content LIKE '%Sorry we cannot complete the flow as of now%' THEN message_id END) AS function_call_failed,
        COUNT(DISTINCT CASE WHEN m.role = '1' AND m.content NOT LIKE '%CTA has been shown to the user%' THEN message_id END) AS user_msg,
        COUNT(DISTINCT CASE WHEN m.role = '2' THEN message_id END) AS assis_msg,
        COUNT(DISTINCT message_id) AS overall_messages
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
),

vertical AS (
    SELECT
        created_at, ticket_id, message_id, cst_entity, workflow, plugservice_response
    FROM (
        SELECT
            created_at, ticket_id, message_id,
            cst_entity, workflow, intent,
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    REPLACE(
                                        CAST(substring(plugservice_response, 2, length(plugservice_response) - 2) AS VARCHAR), 
                                        '\', ''
                                    ),
                                    '"tags":"(\[.*?\])"',
                                    '"tags":$1'
                                ),
                                '"xActionParams":"(\{.*?\})"',
                                '"xActionParams":$1'
                            ),
                            '"aiConversationData":"(\{.*?\})"',
                            '"aiConversationData":$1'
                        ),
                        '"cstMetadata":"(\{.*?\})"',
                        '"cstMetadata":$1'
                    ),
                    '"merchant_type":"(\[.*?\])"',
                    '"merchant_type":$1'
                ),
                'Other Issues',
                'Other_Issues'
            ) AS plugservice_response
            --REPLACE(CAST(substring(plugservice_request, 2, length(plugservice_request) - 2) AS VARCHAR), '\', '') AS plugservice_request
        FROM "hive"."mhd_crm_cst"."vertical_analytics_data_snapshot_v3"
        WHERE dl_last_updated >= DATE '2026-01-01'
        AND DATE(created_at) >= DATE '2026-01-01'
    ) sub
    GROUP BY 1, 2, 3, 4, 5, 6
),

final1 AS (

    SELECT
        a.id,
        a.cst_entity,
        a.created_at,
        
        g.user_msg,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.planUpgrade_soundbox_offers.FEResponse.status'))
            AS planUpgrade_soundbox_offers_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.checkSoundboxHardwareStatus.FEResponse.status'))
            AS checkSoundboxHardwareStatus_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.raiseServiceRequest.FCResponse.status'))
            AS raiseServiceRequest_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.call_me_back.FEResponse.status'))
            AS call_me_back_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.trackDeviceForChanges.FCResponse.status'))
            AS trackDeviceForChanges_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.testBroadCast.FEResponse.status'))
            AS testBroadCast_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.showDeviceList.FEResponse.status'))
            AS showDeviceList_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.get_settlement_and_payment_information.FCResponse.status'))
            AS get_settlement_info_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.agent_handover.FCResponse.status'))
            AS agent_handover_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.trackSettlementForChanges.FCResponse.status'))
            AS trackSettlementForChanges_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.plan_upgrade_payment.FCResponse.status'))
            AS plan_upgrade_payment_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.raiseDeactivationRequest.FEResponse.status'))
            AS raiseDeactivationRequest_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.update_soundbox_address.FCResponse.status'))
            AS update_soundbox_address_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.fetch_specific_payment_details.FEResponse.status'))
            AS fetch_specific_payment_details_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.update_soundbox_address_new.FCResponse.status'))
            AS update_soundbox_address_new_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.apply_retention_offer.FCResponse.status'))
            AS apply_retention_offer_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.showEDCDeviceList.FEResponse.status'))
            AS showEDCDeviceList_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.parkToOtherTeam.FEResponse.status'))
            AS parkToOtherTeam_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.call_patch_to_agent.FEResponse.status'))
            AS call_patch_to_agent_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.checkEDCHardwareResposne.FEResponse.status'))
            AS checkEDCHardwareResposne_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.update_profile_address.FCResponse.status'))
            AS update_profile_address_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.parkToSupport.FCResponse.status'))
            AS parkToSupport_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.View_Tickets.FEResponse.status'))
            AS view_tickets_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.deactivationRequest.FEResponse.status'))
            AS deactivationRequest_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.get_edc_error_code.FCResponse.status'))
            AS get_edc_error_code_status,

        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response.rental_Details.FEResponse.status'))
            AS rental_Details_status,

        b.workflow, b.plugservice_response

    FROM session_data a
    LEFT JOIN vertical b ON a.id = b.ticket_id
    LEFT JOIN grouped_sess g ON a.id = g.id
)

SELECT
    DATE(created_at) AS date_,
    CASE WHEN cst_entity IS NOT NULL THEN cst_entity ELSE 'NULL' END AS cst_entity,
    COUNT(DISTINCT id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN user_msg > 0 THEN id END) AS active_sessions,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%'
        THEN id END) AS planUpgrade_soundbox_offers_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%'
        AND planUpgrade_soundbox_offers_status = 'success'
        THEN id END) AS planUpgrade_soundbox_offers_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_checkSoundboxHardwareStatus%'
        THEN id END) AS checkSoundboxHardwareStatus_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_checkSoundboxHardwareStatus%'
        AND checkSoundboxHardwareStatus_status = 'success'
        THEN id END) AS checkSoundboxHardwareStatus_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseServiceRequest%'
        THEN id END) AS raiseServiceRequest_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseServiceRequest%'
        AND raiseServiceRequest_status = 'service request is raised'
        THEN id END) AS raiseServiceRequest_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_call_me_back%'
        THEN id END) AS call_me_back_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_call_me_back%'
        AND call_me_back_status = 'success'
        THEN id END) AS call_me_back_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_trackDeviceForChanges%'
        THEN id END) AS trackDeviceForChanges_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_trackDeviceForChanges%'
        AND trackDeviceForChanges_status = 'success'
        THEN id END) AS trackDeviceForChanges_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_testBroadCast%'
        THEN id END) AS testBroadCast_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_testBroadCast%'
        AND testBroadCast_status = 'success'
        THEN id END) AS testBroadCast_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_showDeviceList%'
        THEN id END) AS showDeviceList_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_showDeviceList%'
        AND showDeviceList_status = 'success'
        THEN id END) AS showDeviceList_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_get_settlement_and_payment_information%'
        THEN id END) AS get_settlement_info_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_get_settlement_and_payment_information%'
        AND get_settlement_info_status = 'success'
        THEN id END) AS get_settlement_info_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
        THEN id END) AS agent_handover_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
        AND agent_handover_status = 'success'
        THEN id END) AS agent_handover_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_trackSettlementForChanges%'
        THEN id END) AS trackSettlementForChanges_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_trackSettlementForChanges%'
        AND trackSettlementForChanges_status = 'success'
        THEN id END) AS trackSettlementForChanges_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_plan_upgrade_payment%'
        THEN id END) AS plan_upgrade_payment_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_plan_upgrade_payment%'
        AND plan_upgrade_payment_status = 'success'
        THEN id END) AS plan_upgrade_payment_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseDeactivationRequest%'
        THEN id END) AS raiseDeactivationRequest_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseDeactivationRequest%'
        AND raiseDeactivationRequest_status = 'success'
        THEN id END) AS raiseDeactivationRequest_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_soundbox_address%'
        AND workflow NOT LIKE '%ACPS_update_soundbox_address_new%'
        THEN id END) AS update_soundbox_address_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_soundbox_address%'
        AND workflow NOT LIKE '%ACPS_update_soundbox_address_new%'
        AND update_soundbox_address_status = 'success'
        THEN id END) AS update_soundbox_address_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_fetch_specific_payment_details%'
        THEN id END) AS fetch_specific_payment_details_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_fetch_specific_payment_details%'
        AND fetch_specific_payment_details_status = 'success'
        THEN id END) AS fetch_specific_payment_details_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_soundbox_address_new%'
        THEN id END) AS update_soundbox_address_new_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_soundbox_address_new%'
        AND update_soundbox_address_new_status = 'success'
        THEN id END) AS update_soundbox_address_new_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_apply_retention_offer%'
        THEN id END) AS apply_retention_offer_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_apply_retention_offer%'
        AND apply_retention_offer_status = 'success'
        THEN id END) AS apply_retention_offer_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_showEDCDeviceList%'
        THEN id END) AS showEDCDeviceList_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_showEDCDeviceList%'
        AND showEDCDeviceList_status = 'success'
        THEN id END) AS showEDCDeviceList_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_parkToOtherTeam%'
        THEN id END) AS parkToOtherTeam_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_parkToOtherTeam%'
        AND parkToOtherTeam_status = 'success'
        THEN id END) AS parkToOtherTeam_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_call_patch_to_agent%'
        THEN id END) AS call_patch_to_agent_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_call_patch_to_agent%'
        AND call_patch_to_agent_status = 'success'
        THEN id END) AS call_patch_to_agent_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_checkEDCHardwareResposne%'
        THEN id END) AS checkEDCHardwareResposne_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_checkEDCHardwareResposne%'
        AND checkEDCHardwareResposne_status = 'success'
        THEN id END) AS checkEDCHardwareResposne_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_profile_address%'
        THEN id END) AS update_profile_address_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_update_profile_address%'
        AND update_profile_address_status = 'success'
        THEN id END) AS update_profile_address_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_parkToSupport%'
        THEN id END) AS parkToSupport_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_parkToSupport%'
        AND parkToSupport_status = 'success'
        THEN id END) AS parkToSupport_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_View Tickets%'
        THEN id END) AS view_tickets_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_View Tickets%'
        AND view_tickets_status = 'success'
        THEN id END) AS view_tickets_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_deactivationRequest%'
        AND workflow NOT LIKE '%ACPS_raiseDeactivationRequest%'
        THEN id END) AS deactivationRequest_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_deactivationRequest%'
        AND workflow NOT LIKE '%ACPS_raiseDeactivationRequest%'
        AND deactivationRequest_status = 'success'
        THEN id END) AS deactivationRequest_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_get_edc_error_code%'
        THEN id END) AS get_edc_error_code_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_get_edc_error_code%'
        AND get_edc_error_code_status = 'success'
        THEN id END) AS get_edc_error_code_success,

    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_rental_Details%'
        THEN id END) AS rental_Details_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_rental_Details%'
        AND rental_Details_status = 'success'
        THEN id END) AS rental_Details_success

FROM final1
WHERE DATE(created_at) >= DATE '2026-01-01'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

--- Day-wise Entity + Model + Prompt Level Eval Metrics + MSAT + Ticket Creation Analysis ---
-- IMPORTANT: This query outputs one row per (date, cst_entity, expModel, expPrompt) combination.
-- A single session can appear in multiple rows if the user switched entities/intents mid-session
-- (causing different prompts/models to load). This is by design — always analyse at entity+prompt
-- level, never aggregate across prompts to get a session total.
-- For weighted averages across prompts, use _sum / _count columns, not AVG of AVG.
-- devrev CTE: NO cst_entity filter — ticket_type is classified in final1 using session_data entity.

WITH session_data AS (
    SELECT
        id,
        created_at,
        fd_ticket_id,
        cst_entity
    FROM "hive"."mhd_crm_cst"."support_ticket_details_snapshot_v3"
    WHERE dl_last_updated >= DATE '2025-09-01'
    AND DATE(created_at) >= DATE '2025-09-01'
    AND source = 100
    AND id NOT LIKE '2-%'
    AND cst_entity NOT IN ('proactiveinitentity', 'p4bwelcomeentity')
    GROUP BY 1, 2, 3, 4
),

-- Single scan of conversation table — used by both model_base and grouped_sess.
-- content extracted here so grouped_sess does not need a second table scan.
messages_data AS (
    SELECT
        ticket_id,
        message_id,
        role,
        COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel,
        json_extract_scalar(meta, '$.expPrompt') AS expPrompt,
        json_extract_scalar(meta, '$.llmEndPoint') AS llmEndPoint,
        REGEXP_REPLACE(JSON_EXTRACT_SCALAR(content, '$.content'), '\\.', '') AS content
    FROM "hive"."mhd_crm_cst"."ticket_session_conversation_snapshot_v3"
    WHERE dl_last_updated >= DATE '2025-09-01'
    AND ticket_id IN (SELECT DISTINCT id FROM session_data)
),

-- One row per (session, expModel, expPrompt). Excludes proactive/welcome prompts and
-- system messages. A session with multiple prompts produces multiple rows here —
-- this is intentional; the final GROUP BY (entity, model, prompt) handles bucketing.
model_base AS (
    SELECT
        ticket_id,
        expModel,
        expPrompt
    FROM messages_data
    WHERE expModel IS NOT NULL
    AND expPrompt NOT LIKE '%PROACTIVE%'
    AND expPrompt NOT LIKE '%WELCOME%'
    AND role = '2'
    GROUP BY 1, 2, 3
),

grouped_sess AS (
    SELECT
        s.id,
        COUNT(DISTINCT CASE WHEN m.role = '1' THEN m.message_id END) AS user_msg,
        COUNT(DISTINCT CASE WHEN m.role = '2' THEN m.message_id END) AS assis_msg,
        COUNT(DISTINCT CASE WHEN m.content LIKE '%Sorry we cannot complete the flow as of now%' THEN m.message_id END) AS function_call_failed
    FROM session_data s
    LEFT JOIN messages_data m ON s.id = m.ticket_id
    GROUP BY 1
),

feedback_status AS (
    SELECT
        ticket_id,
        feedback_status
    FROM "hive"."mhd_crm_cst"."ticket_meta_snapshot_v3"
    WHERE dl_last_updated >= DATE '2025-09-01'
        AND DATE(created_at) >= DATE '2025-09-01'
    GROUP BY 1, 2
),

feedback_analyzed AS (
    SELECT
        ticket_id,
        NULLIF(
            CASE
                WHEN TRY_CAST(eval_score AS DOUBLE) IS NULL THEN 0
                ELSE CAST(eval_score AS DOUBLE)
            END, 0) AS eval_score,
        out_key_problem_desc,
        json_extract_scalar(metrics_json, '$.empathy_score') AS empathy_score,
        json_extract_scalar(metrics_json, '$.topic_drift_count') AS topic_drift_count,
        json_extract_scalar(metrics_json, '$.resolution_achieved') AS resolution_achieved,
        json_extract_scalar(metrics_json, '$.sentiment_net_change') AS sentiment_net_change,
        json_extract_scalar(metrics_json, '$.user_sentiment_start') AS user_sentiment_start,
        json_extract_scalar(metrics_json, '$.user_sentiment_end') AS user_sentiment_end,
        json_extract_scalar(metrics_json, '$.intent_incoherence_count') AS intent_incoherence_count,
        json_extract_scalar(metrics_json, '$.agent_response_repetition') AS agent_response_repetition,
        json_extract_scalar(metrics_json, '$.response_relevance_score') AS response_relevance_score
    FROM (
        SELECT
            ticket_id,
            eval_score,
            metrics_json,
            out_key_problem_desc,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC) AS r
        FROM "hive"."mhd_crm_cst"."feedback_complete_analyzed_data_snapshot_v3"
        WHERE dl_last_updated >= DATE '2025-09-01'
            AND DATE(created_at) >= DATE '2025-09-01'
    ) sub
    WHERE r = 1
),

-- NO cst_entity filter on devrev — stored entity can differ from session entity.
-- ticket_type classification uses session_data.cst_entity in final1 instead.
devrev AS (
    SELECT
        id,
        fd_ticket_id
    FROM "hive"."mhd_cst_ticket"."support_ticket_details_snapshot_v3"
    WHERE dl_last_updated >= DATE '2025-09-01'
    AND DATE(created_at) >= DATE '2025-09-01'
    GROUP BY 1, 2
),

final1 AS (
    SELECT
        a.id,
        a.created_at,
        d.fd_ticket_id,
        -- ticket_type uses session_data cst_entity (not devrev entity) per §7 rule
        CASE
            WHEN d.fd_ticket_id IS NOT NULL AND a.cst_entity IN ('p4bsoundbox', 'p4bedc') THEN 'service'
            WHEN d.fd_ticket_id IS NOT NULL AND a.cst_entity = 'p4bAIBot' THEN 'agent handover'
            WHEN d.fd_ticket_id IS NOT NULL THEN 'agent handover'
            ELSE NULL
        END AS ticket_type,
        a.cst_entity,

        b.ticket_id,
        x.expModel,
        x.expPrompt,

        b.eval_score,
        CASE
            WHEN TRY_CAST(b.eval_score AS DOUBLE) >= 0.8 THEN 'Good'
            WHEN TRY_CAST(b.eval_score AS DOUBLE) >= 0.5 AND TRY_CAST(b.eval_score AS DOUBLE) < 0.8 THEN 'Neutral'
            WHEN TRY_CAST(b.eval_score AS DOUBLE) < 0.5 AND TRY_CAST(b.eval_score AS DOUBLE) > 0.0 THEN 'Bad'
            ELSE 'Invalid'
        END AS eval_score_check,
        b.empathy_score,
        b.topic_drift_count,
        b.resolution_achieved,
        b.sentiment_net_change,
        b.user_sentiment_start,
        b.user_sentiment_end,
        b.intent_incoherence_count,
        b.agent_response_repetition,
        CASE
            WHEN TRY_CAST(b.response_relevance_score AS DOUBLE) IS NULL THEN NULL
            ELSE TRY_CAST(b.response_relevance_score AS DOUBLE)
        END AS response_relevance_score,
        CASE
            WHEN b.user_sentiment_start IS NOT NULL AND b.user_sentiment_end IS NOT NULL
            THEN TRY_CAST(b.user_sentiment_end AS DOUBLE) - TRY_CAST(b.user_sentiment_start AS DOUBLE)
            ELSE NULL
        END AS change_in_user_sentiment,
        b.out_key_problem_desc,

        CASE
            WHEN COALESCE(g.user_msg, 0) = 0 THEN 'Bounced Session'
            WHEN g.user_msg >= 1 THEN 'Active Session'
            ELSE 'Unknown'
        END AS sess_type,
        COALESCE(g.user_msg, 0) AS user_msg,
        COALESCE(g.assis_msg, 0) AS assis_msg,
        COALESCE(g.function_call_failed, 0) AS function_call_failed,

        f.feedback_status
    FROM session_data a
    LEFT JOIN feedback_analyzed b ON a.id = b.ticket_id
    LEFT JOIN grouped_sess g ON a.id = g.id
    LEFT JOIN feedback_status f ON a.id = f.ticket_id
    LEFT JOIN devrev d ON a.id = d.id
    LEFT JOIN model_base x ON a.id = x.ticket_id
    WHERE x.expPrompt IS NOT NULL
)

SELECT
    DATE(created_at) AS date_,
    cst_entity,
    expModel,
    expPrompt,

    COUNT(DISTINCT id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN sess_type = 'Active Session' THEN id END) AS active_sessions,

    COUNT(DISTINCT fd_ticket_id) AS fd_tickets,
    COUNT(DISTINCT CASE WHEN ticket_type = 'service' THEN fd_ticket_id END) AS service_tickets,
    COUNT(DISTINCT CASE WHEN ticket_type = 'agent handover' THEN fd_ticket_id END) AS ah_tickets,

    COUNT(DISTINCT ticket_id) AS analyzed_sessions,
    COUNT(DISTINCT CASE WHEN eval_score IS NOT NULL AND eval_score <> 0 THEN ticket_id END) AS eval_completed,
    AVG(CASE WHEN eval_score IS NOT NULL AND eval_score <> 0 THEN TRY_CAST(eval_score AS DOUBLE) ELSE NULL END) AS avg_eval_score,
    SUM(CASE WHEN eval_score IS NOT NULL AND eval_score <> 0 THEN eval_score ELSE 0 END) AS eval_score_sum,
    COUNT(DISTINCT CASE WHEN eval_score IS NOT NULL AND eval_score <> 0 THEN id END) AS eval_session_count,

    COALESCE(COUNT(DISTINCT CASE WHEN feedback_status = '2' THEN id END), 0) AS happy,
    COALESCE(COUNT(DISTINCT CASE WHEN feedback_status = '3' THEN id END), 0) AS sad,

    COUNT(DISTINCT CASE WHEN eval_score_check = 'Good' THEN id END) AS eval_score_good,
    COUNT(DISTINCT CASE WHEN eval_score_check = 'Bad' THEN id END) AS eval_score_bad,
    COUNT(DISTINCT CASE WHEN eval_score_check = 'Neutral' THEN id END) AS eval_score_neutral,

    -- response_relevance_score: avg + sum/count for weighted avg across groups
    AVG(CASE WHEN response_relevance_score IS NOT NULL AND response_relevance_score <> 0 THEN TRY_CAST(response_relevance_score AS DOUBLE) ELSE NULL END) AS avg_response_relevance_score,
    SUM(CASE WHEN response_relevance_score IS NOT NULL AND response_relevance_score <> 0 THEN TRY_CAST(response_relevance_score AS DOUBLE) ELSE 0 END) AS response_relevance_score_sum,
    COUNT(DISTINCT CASE WHEN response_relevance_score IS NOT NULL AND response_relevance_score <> 0 THEN id END) AS response_relevance_score_count,

    -- empathy_score: avg + sum/count
    AVG(CASE WHEN empathy_score IS NOT NULL THEN TRY_CAST(empathy_score AS DOUBLE) ELSE NULL END) AS avg_empathy_score,
    SUM(CASE WHEN empathy_score IS NOT NULL THEN TRY_CAST(empathy_score AS DOUBLE) ELSE 0 END) AS empathy_score_sum,
    COUNT(DISTINCT CASE WHEN empathy_score IS NOT NULL THEN id END) AS empathy_score_count,

    -- topic_drift_count: avg + sum/count
    AVG(CASE WHEN topic_drift_count IS NOT NULL THEN TRY_CAST(topic_drift_count AS DOUBLE) ELSE NULL END) AS avg_topic_drift,
    SUM(CASE WHEN topic_drift_count IS NOT NULL THEN TRY_CAST(topic_drift_count AS DOUBLE) ELSE 0 END) AS topic_drift_sum,
    COUNT(DISTINCT CASE WHEN topic_drift_count IS NOT NULL THEN id END) AS topic_drift_count,

    -- sentiment_net_change: avg + sum/count
    AVG(CASE WHEN sentiment_net_change IS NOT NULL THEN TRY_CAST(sentiment_net_change AS DOUBLE) ELSE NULL END) AS avg_sentiment_change,
    SUM(CASE WHEN sentiment_net_change IS NOT NULL THEN TRY_CAST(sentiment_net_change AS DOUBLE) ELSE 0 END) AS sentiment_change_sum,
    COUNT(DISTINCT CASE WHEN sentiment_net_change IS NOT NULL THEN id END) AS sentiment_change_count,

    -- resolution_achieved: avg + sum/count
    ROUND(AVG(
        CASE
            WHEN resolution_achieved IS NOT NULL AND TRY_CAST(resolution_achieved AS DOUBLE) > 0
            THEN TRY_CAST(resolution_achieved AS DOUBLE)
            ELSE NULL
        END
    ), 3) AS avg_resolution_achieved,
    SUM(CASE WHEN resolution_achieved IS NOT NULL AND TRY_CAST(resolution_achieved AS DOUBLE) > 0 THEN TRY_CAST(resolution_achieved AS DOUBLE) ELSE 0 END) AS resolution_achieved_sum,
    COUNT(DISTINCT CASE WHEN resolution_achieved IS NOT NULL AND TRY_CAST(resolution_achieved AS DOUBLE) > 0 THEN id END) AS resolution_achieved_count,

    COUNT(DISTINCT CASE WHEN TRY_CAST(change_in_user_sentiment AS DOUBLE) > 0.00 THEN id END) AS positive_user_sentiment,
    COUNT(DISTINCT CASE WHEN TRY_CAST(change_in_user_sentiment AS DOUBLE) = 0 THEN id END) AS neutral_user_sentiment,
    COUNT(DISTINCT CASE WHEN TRY_CAST(change_in_user_sentiment AS DOUBLE) < 0.00 THEN id END) AS negative_user_sentiment,

    COUNT(DISTINCT CASE
        WHEN intent_incoherence_count IS NOT NULL
        AND TRY_CAST(intent_incoherence_count AS INTEGER) > 0
        THEN ticket_id
    END) AS intent_incoherence_count,

    COUNT(DISTINCT CASE
        WHEN agent_response_repetition IS NOT NULL
        AND TRY_CAST(agent_response_repetition AS INTEGER) > 0
        THEN ticket_id
    END) AS agent_response_repetition,

    COUNT(DISTINCT CASE WHEN function_call_failed > 0 THEN id END) AS function_call_failed

FROM final1
WHERE expModel IS NOT NULL
GROUP BY 1, 2, 3, 4;