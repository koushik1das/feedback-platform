# CST & MHD Data Guide

> Maintained by the FeedbackIQ team. Update this document whenever new table logic,
> join patterns, or pipeline nuances are discovered. This is the single source of
> truth for anyone writing Trino queries against CST/MHD data.

---

## §A1. Entity & Intent Detection — cst_entity Lookup

Use this table to map a user's natural language question to the correct `cst_entity` value(s) before writing any SQL. Read the Description column to identify which product the user is referring to.

> **CST entities** use `hive.cst_ticket.support_ticket_details_snapshot_v3` and `hive.crm_cst.*`.
> **MHD entities** (those starting with `p4b`) use `hive.mhd_crm_cst.*` and `hive.mhd_cst_ticket.*`.

| Category | Product | cst_entity (use exactly) | When the user is asking about… |
|----------|---------|--------------------------|-------------------------------|
| Merchant (MHD) | Device | `cst_entity IN ('p4bsoundbox', 'p4bAIBot', 'p4bedc')` | Soundbox device analytics, session counts, eval scores, transcript analysis, hardware complaints, EDC/Card Machine issues, agent handover trends, return/deactivation patterns, rental disputes, monthly reports, ticket creation across all Soundbox/EDC interactions |
| Merchant (MHD) | Business Loan | `cst_entity = 'p4bbusinessloan'` | Lending analytics, loan application funnel, EDI/EMI repayment trends, loan closure/rejection queries, monthly reports on merchant lending support |
| Merchant (MHD) | Profile | `cst_entity = 'p4bprofile'` | Profile and KYC analytics, KYC failure trends, bank account update requests, profile/shop detail change support, monthly reports on merchant account support |
| Merchant (MHD) | Settlement and Payments | `cst_entity = 'p4bpayoutandsettlement'` | Payment and settlement analytics, failed payment trends, QR complaints, settlement delay patterns, MDR/deduction tickets, monthly payout and collection reports |
| Merchant (MHD) | Wealth | `cst_entity = 'p4bwealth'` | Gold and Silver Locker analytics, investment plan activation/cancellation, buy/sell transaction volumes, wealth feature support tickets |
| Customer (CST) | Investments | `cst_entity IN ('gold', 'pspl')` | Gold and PSPL (Paytm Select Plan/Liquid Fund) analytics, buy/sell trends, investment activation/cancellation, monthly Gold and investment reports |
| Customer (CST) | ONDC | `cst_entity = 'ondc-commerce'` | ONDC commerce analytics, order issue trends, delivery/cancellation complaints, ONDC buyer support |
| Customer (CST) | Personal Loan | `cst_entity = 'personalloan'` | Personal loan analytics, loan application funnel, KYC drop-off, EMI/repayment volumes, disbursement tickets |
| Customer (CST) | Profile | `cst_entity = 'paytm-profile'` | User profile and account analytics, login issues, mobile/email change requests, account closure tickets |
| Customer (CST) | Recharge & Utilities | `cst_entity IN ('ccbp', 'challan', 'citybus', 'creditcard', 'cylinder', 'digital-subscriptions', 'dth', 'electricity', 'fastag', 'gas', 'insurance', 'landline', 'loan', 'metro', 'mobilepostpaid', 'mobileprepaid', 'mortgage', 'municipal', 'ru_education', 'ru_insurance', 'voucher', 'water', 'apartment', 'cabletv', 'creditline', 'datacard', 'donation', 'entertainment', 'gprc', 'loanagainstmutualfund', 'paytmdeals', 'postpaid', 'recharge', 'rent', 'retailinsurance', 'toll')` | Mobile prepaid/postpaid, DTH, electricity, FASTag, gas/cylinder, insurance, credit card bill payment, rent, education, loans, credit line, vouchers, and all other bill payment and recharge support |
| Customer (CST) | Travel | `cst_entity IN ('bus', 'flight', 'train')` | Travel booking analytics — bus, flight, train booking/cancellation trends, refund volumes, travel support |
| Customer (CST) | UPI | `cst_entity = 'upi-ocl'` | UPI and OCL (One Credit Line) analytics, UPI transaction failures, PIN changes, bank account linking, cashback tickets |

**Rules:**
- Always resolve `cst_entity` from this table before writing a single line of SQL.
- If the user says "soundbox", "device", "EDC", or "card machine" → always use the three-entity `IN` clause — never a single entity.
- If the user says "recharge" generically without specifying a utility type → use the full Recharge & Utilities `IN` list.
- If the user says "travel" → use `IN ('bus', 'flight', 'train')`.
- If the entity is ambiguous (e.g. user says "payments" which could be `p4bpayoutandsettlement` or a CST recharge entity) → ask the user to clarify before generating SQL.

---

## §A2. L1 Issue Label Master Reference (`out_key_problem_desc`)

> **Scope: MHD only.** CST L1 mappings will be added in a future update.

Use this table when: (a) the user asks to filter by a specific issue type, (b) you need to suggest what L1s are available for a given entity, or (c) you need to validate a label before using it in a LIKE pattern.

**How to use:** Find the entity row(s) for the user's question. The "Key-Problem Description Title" column contains the exact string stored in `out_key_problem_desc`. Use the most distinctive 2-3 words from that title as your `LOWER(f.out_key_problem_desc) LIKE '%keyword%'` pattern (never `=`). See §0.2c.

### Payments and Settlements — `p4bpayoutandsettlement`

| # | out_key_problem_desc (exact stored value) |
|---|------------------------------------------|
| 1 | Payout Success - Amount not Credited |
| 2 | Payout Pending |
| 3 | Payout Failed |
| 4 | Settlement Data not available |
| 5 | Short/Less Payout received |
| 6 | Chargeback Transaction |
| 7 | Payout Unhold/Hold |
| 8 | Instant Settlement Activation |
| 9 | Payout Success |
| 10 | QR not working |
| 11 | Order/download QR |
| 12 | Rupay CC UPI enable/disable |
| 13 | Transaction Status - Success |
| 14 | Transaction Status - Not Found |
| 15 | Transaction Status - Failed |
| 16 | Transaction Status - Pending |
| 17 | Payment Limit Related |
| 18 | Account Upgrade Request |
| 19 | Bank Account Change |

### Device (Soundbox + EDC) — `p4bsoundbox`, `p4bAIBot`, `p4bedc`

| # | out_key_problem_desc (exact stored value) |
|---|------------------------------------------|
| 1 | Soundbox Device Battery Issue |
| 2 | Soundbox Device Charger Issue |
| 3 | Soundbox Sound not Coming |
| 4 | Soundbox Device not turning on - charger connected |
| 5 | Soundbox Device Damage |
| 6 | Soundbox Deactivation Request |
| 7 | Soundbox Device Lost |
| 8 | Soundbox Device Rental Info |
| 9 | Soundbox Device Picked rental not stopped |
| 10 | Soundbox Multiple Rental deduction |
| 11 | Soundbox Device Refund Related |
| 12 | Soundbox Device Not Working |
| 13 | Soundbox Order & Delivery Related |
| 14 | EDC Device Battery Issue |
| 15 | EDC Device Charging Issue |
| 16 | EDC Device Network SIM Issue |
| 17 | EDC Device Not Working |
| 18 | EDC Device Damaged |
| 19 | EDC Device Switch On Issue |
| 20 | EDC PED Tempered Issue |
| 21 | EDC Device Activation Issue |
| 22 | EDC Card Read Error |
| 23 | EDC Terminal Lock Issue |
| 24 | EDC Printer Issue |
| 25 | EDC Error Code on Screen |
| 26 | EDC Device Rental Info |
| 27 | EDC Device Commission Charges Related |
| 28 | EDC International Card Related |
| 29 | EDC Amex Card Related |
| 30 | EDC Instrument Enable/Disable |
| 31 | EDC Device Upgrade |
| 32 | EDC Device Lost |
| 33 | EDC Deactivation Request |
| 34 | EDC Device Plan Upgrade |
| 35 | EDC Device Network Wifi Issue |
| 36 | EDC Device Refund Related |
| 37 | EDC New Device Request |
| 38 | EDC Physical Training Request |
| 39 | EDC Order & Delivery Related |
| 40 | EDC Device Picked rental not stopped |
| 41 | EDC Multiple Rental/MDR deduction |

### Business Loan — `p4bbusinessloan`

| # | out_key_problem_desc (exact stored value) |
|---|------------------------------------------|
| 1 | Loan Application Status |
| 2 | Unable to complete the application |
| 3 | Loan amount Disbursal/Credit related |
| 4 | Loan Rejection Reason |
| 5 | Loan Offer Related |
| 6 | Loan Closure Related |
| 7 | EDI Related Information |
| 8 | Multiple EDI deduction Issue |
| 9 | EDI deduction issue |
| 10 | Loan Cancellation Related |
| 11 | Self Pay/Re-pay Related |
| 12 | Loan Statement Download |
| 13 | Insurance Related |
| 14 | Cibil Score Related |
| 15 | FSE Miselling |
| 16 | FSE Behaviour Issue |

### Profile — `p4bprofile`

| # | out_key_problem_desc (exact stored value) |
|---|------------------------------------------|
| 1 | Merchant Account Reactivation |
| 2 | Bank Account Change |
| 3 | Primary Number Change |
| 4 | Pan Card Change |
| 5 | Payment Limit Related |
| 6 | Account Upgrade Request |
| 7 | Display Name Change Request |
| 8 | Business Name Change Request |
| 9 | Re-KYC Request |
| 10 | Business Category Change |
| 11 | Notification Related |
| 12 | Business Address Change |
| 13 | GST Number Update |
| 14 | Primary Email Id Update |
| 15 | Billing Address Change |
| 16 | Authorised Signatory Name Change |
| 17 | Account Termination Request |
| 18 | SMS Service Activation |

### Wealth — `p4bwealth`

| # | out_key_problem_desc (exact stored value) |
|---|------------------------------------------|
| 1 | Activation Request |
| 2 | Auto Debit Issue |
| 3 | Balance Enquiry |
| 4 | Balance Related Issue |
| 5 | Cancel Gold Plan Investment |
| 6 | Fund Not Credited to Bank Post Withdrawal |
| 7 | Gold Coin Delivery |
| 8 | Gold Saving FAQ |
| 9 | Sell Gold |

---

## §A3. Experiment Prompt × Entity × Model Mapping

**Purpose:** When a user asks for model-level or prompt-level analysis, use this section to add exact `expPrompt` and/or `expModel` filters. Never filter by model alone — always add the corresponding `expPrompt IN (...)` filter from this lookup.

**Model shorthand aliases** (used in tables below):
| Alias | Full expModel value |
|---|---|
| GPT120B | `GPT_OSS_120B_INVOKE_STREAM` |
| LLAMA70B | `TFY_LLAMA_3_3_70B_STREAM` |
| GEMMA27B | `TRUEFOUNDRY_GEMMA_3_27B_STREAM` |
| SB_LORA | `PI_CST_P4B_SB_LORA_STREAM` |
| SB_THINK | `PI_CST_P4B_SB_THINK_LORA_STREAM` |
| SB_SLM | `PI_CST_SOUNDBOX_SLM_BETA` |
| BL_LORA | `PI_CST_P4B_BL_LORA_STREAM` |
| AGENTIC_GPT | `PI_AGENTIC_GPT_OSS_120B` |

---

### §A3.1 — MHD (Merchant) Prompts

MHD entity shorthand: **all-mhd-7** = `p4bAIBot, p4bbusinessloan, p4bedc, p4bpayoutandsettlement, p4bprofile, p4bsoundbox, p4bwealth`

| expPrompt | cst_entity values | expModel values |
|---|---|---|
| `DEVICE_CONTEXTUAL_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B, SB_LORA, SB_SLM |
| `DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA` | all-mhd-7 | GPT120B, LLAMA70B |
| `Device_Contextual_Prompt_Think_Tag` | all-mhd-7 except p4bwealth | SB_LORA, SB_THINK |
| `LENDING_CONTEXTUAL_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B, BL_LORA |
| `Lending_Contextual_Experiment_Prompt` | all-mhd-7 | GPT120B, LLAMA70B |
| `LENDING_CONTEXTUAL_LANG_EXP_PROMPT` | p4bAIBot, p4bbusinessloan, p4bpayoutandsettlement, p4bprofile, p4bsoundbox | GPT120B |
| `SETTLEMENT_CONTEXTUAL_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B, SB_LORA, BL_LORA |
| `SETTLEMENT_CONTEXTUAL_EXPERIMENT_PROMPT` | all-mhd-7 | GPT120B |
| `SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B |
| `P4B_PROFILE_CONTEXTUAL_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B |
| `P4B_PROFILE_CONTEXTUAL_PROMPT_LANGUAGE_EXPERIMENT` | all-mhd-7 except p4bedc | GPT120B |
| `WEALTH_CONTEXTUAL_PROMPT` | all-mhd-7 | GPT120B, LLAMA70B |
| `WEALTH_CONTEXTUAL_LANG_EXP_PROMPT` | p4bAIBot, p4bbusinessloan, p4bprofile, p4bsoundbox, p4bwealth | GPT120B |
| `PAYTM_RU_CONTEXTUAL_PROMPT` *(MHD)* | mobileprepaid | LLAMA70B |

**MHD model → prompts reverse lookup** (use for `expModel` filter queries):

- **GPT120B** (MHD): `DEVICE_CONTEXTUAL_PROMPT`, `DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA`, `LENDING_CONTEXTUAL_PROMPT`, `Lending_Contextual_Experiment_Prompt`, `LENDING_CONTEXTUAL_LANG_EXP_PROMPT`, `SETTLEMENT_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_EXPERIMENT_PROMPT`, `SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT_LANGUAGE_EXPERIMENT`, `WEALTH_CONTEXTUAL_PROMPT`, `WEALTH_CONTEXTUAL_LANG_EXP_PROMPT`
- **LLAMA70B** (MHD): `DEVICE_CONTEXTUAL_PROMPT`, `DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA`, `LENDING_CONTEXTUAL_PROMPT`, `Lending_Contextual_Experiment_Prompt`, `SETTLEMENT_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT`, `WEALTH_CONTEXTUAL_PROMPT`
- **SB_LORA** (MHD): `DEVICE_CONTEXTUAL_PROMPT`, `Device_Contextual_Prompt_Think_Tag`, `SETTLEMENT_CONTEXTUAL_PROMPT`
- **SB_THINK** (MHD): `Device_Contextual_Prompt_Think_Tag`
- **SB_SLM** (MHD): `DEVICE_CONTEXTUAL_PROMPT`
- **BL_LORA** (MHD): `LENDING_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_PROMPT`

---

### §A3.2 — CST (Customer) Prompts

| expPrompt | cst_entity values | expModel values |
|---|---|---|
| `PAYTM_RU_CONTEXTUAL_PROMPT` | apartment, bus, cabletv, ccbp, challan, citybus, creditcard, creditline, cylinder, datacard, digital-subscriptions, donation, dth, electricity, fastag, flight, gas, gold, gprc, insurance, landline, loan, loanagainstmutualfund, metro, mobilepostpaid, mobileprepaid, mortgage, municipal, ondc-commerce, paytm-profile, personalloan, pspl, rent, retailinsurance, ru_education, ru_insurance, silver, toll, train, upi-ocl, voucher, water, welcomeentity | GPT120B, LLAMA70B |
| `PAYTM_RU_CONTEXTUAL_EXP_PROMPT` | apartment, bus, ccbp, challan, citybus, creditcard, creditline, cylinder, datacard, digital-subscriptions, donation, dth, electricity, fastag, flight, gold, gprc, insurance, landline, loan, metro, mobilepostpaid, mobileprepaid, mortgage, municipal, ondc-commerce, paytm-profile, personalloan, pspl, rent, retailinsurance, ru_education, ru_insurance, toll, train, upi-ocl, voucher, water, welcomeentity | GPT120B, LLAMA70B |
| `PAYTM_RU_CONTEXTUAL_PROMPT_GEMMA` | apartment, bus, cabletv, ccbp, challan, citybus, creditcard, creditline, cylinder, datacard, digital-subscriptions, donation, dth, electricity, fastag, flight, gold, insurance, landline, loan, loanagainstmutualfund, metro, mobilepostpaid, mobileprepaid, mortgage, municipal, ondc-commerce, paytm-profile, personalloan, pspl, rent, ru_education, ru_insurance, toll, train, upi-ocl, voucher, water, welcomeentity | GEMMA27B |
| `UPI_CONTEXTUAL_PROMPT` | bus, cabletv, ccbp, creditcard, creditline, cylinder, digital-subscriptions, dth, electricity, fastag, flight, gold, gprc, insurance, landline, loan, loanagainstmutualfund, metro, mobilepostpaid, mobileprepaid, mortgage, ondc-commerce, paytm-profile, personalloan, pspl, rent, retailinsurance, ru_education, silver, toll, train, upi-ocl, voucher, welcomeentity | GPT120B, LLAMA70B |
| `UPI_CONTEXTUAL_EXP_PROMPT` | bus, ccbp, creditcard, creditline, cylinder, digital-subscriptions, dth, electricity, fastag, flight, gold, insurance, loanagainstmutualfund, mobileprepaid, mortgage, paytm-profile, personalloan, pspl, rent, silver, train, upi-ocl, voucher, welcomeentity | GPT120B, AGENTIC_GPT |
| `PAYTM_TRAVEL_CONTEXTUAL_PROMPT` | bus, cylinder, donation, electricity, flight, insurance, mobilepostpaid, mobileprepaid, paytm-profile, train, upi-ocl, welcomeentity | GPT120B, LLAMA70B, GEMMA27B |
| `PAYTM_PL_CONTEXTUAL_PROMPT` | bus, ccbp, creditcard, creditline, cylinder, digital-subscriptions, dth, electricity, fastag, flight, gold, gprc, insurance, loan, loanagainstmutualfund, mobilepostpaid, mobileprepaid, mortgage, paytm-profile, personalloan, pspl, rent, ru_education, silver, train, upi-ocl, voucher, welcomeentity | GPT120B, LLAMA70B, GEMMA27B |
| `PAYTM_PROFILE_CONTEXTUAL_PROMPT` | bus, ccbp, challan, creditcard, creditline, cylinder, digital-subscriptions, donation, dth, electricity, fastag, flight, gas, gold, insurance, landline, loan, loanagainstmutualfund, metro, mobilepostpaid, mobileprepaid, mortgage, ondc-commerce, paytm-profile, personalloan, pspl, rent, retailinsurance, ru_education, silver, toll, train, upi-ocl, voucher, welcomeentity | GPT120B, LLAMA70B, GEMMA27B |
| `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT` | creditline, gold, loanagainstmutualfund, mobilepostpaid, mobileprepaid, pspl, upi-ocl, welcomeentity | GPT120B, LLAMA70B, GEMMA27B |
| `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT_GEMMA` | bus, ccbp, creditcard, creditline, digital-subscriptions, dth, electricity, fastag, flight, gold, insurance, loan, loanagainstmutualfund, mobileprepaid, mortgage, paytm-profile, personalloan, pspl, rent, ru_education, silver, train, upi-ocl, voucher, welcomeentity | GEMMA27B |
| `PAYTM_INVESTMENT_CONTEXTUAL_LANG_EXP_PROMPT` | creditcard, creditline, digital-subscriptions, gold, insurance, mobileprepaid, paytm-profile, personalloan, pspl, upi-ocl, voucher, welcomeentity | GPT120B |
| `PAYTM_CREDIT_LINE_CONTEXTUAL_PROMPT` | ccbp, creditcard, creditline, cylinder, digital-subscriptions, dth, fastag, flight, gold, insurance, loan, loanagainstmutualfund, mobileprepaid, mortgage, paytm-profile, personalloan, ru_education, train, upi-ocl, welcomeentity | LLAMA70B |
| `PAYTM_CREDIT_LINE_CONTEXTUAL_PROMPT_EXP` | creditcard, creditline, cylinder, flight, gold, loanagainstmutualfund, mobileprepaid, paytm-profile, personalloan, pspl, upi-ocl, welcomeentity | LLAMA70B |
| `PAYTM_INSURANCE_CONTEXTUAL_PROMPT` | insurance, retailinsurance | LLAMA70B |
| `PAYTM_INSURANCE_CONTEXTUAL_EXP_PROMPT` | insurance, retailinsurance | LLAMA70B |
| `PAYTM_LAMF_CONTEXTUAL_PROMPT` | creditcard, creditline, digital-subscriptions, gold, insurance, loanagainstmutualfund, mortgage, paytm-profile, personalloan, pspl, upi-ocl | GPT120B |
| `PAYTM_SILVER_CONTEXTUAL_PROMPT` | creditcard, gold, paytm-profile, personalloan, pspl, silver, upi-ocl | GPT120B |
| `PAYTM_SILVER_CONTEXTUAL_PROMPT_EXP` | gold, paytm-profile, personalloan, silver | GPT120B |
| `PAYTM_ONDC_CONTEXTUAL_PROMPT` | ondc-commerce | GPT120B, LLAMA70B, GEMMA27B |
| `DEVICE_CONTEXTUAL_PROMPT` *(CST)* | p4bbusinessloan, p4bpayoutandsettlement, p4bprofile, p4bsoundbox | GPT120B, LLAMA70B, SB_LORA |
| `LENDING_CONTEXTUAL_PROMPT` *(CST)* | p4bbusinessloan, p4bpayoutandsettlement, p4bsoundbox | GPT120B, LLAMA70B, BL_LORA |
| `P4B_PROFILE_CONTEXTUAL_PROMPT` *(CST)* | p4bbusinessloan, p4bpayoutandsettlement, p4bprofile, p4bsoundbox | GPT120B, LLAMA70B |
| `SETTLEMENT_CONTEXTUAL_PROMPT` *(CST)* | p4bpayoutandsettlement, p4bprofile, p4bsoundbox | GPT120B, LLAMA70B |
| `Settlement_Contextual_Transient_Experiment_Prompt` *(CST)* | p4bbusinessloan, p4bpayoutandsettlement, p4bprofile, p4bsoundbox | GPT120B, LLAMA70B |
| `WEALTH_CONTEXTUAL_PROMPT` *(CST)* | p4bwealth | GPT120B |

**CST model → prompts reverse lookup** (use for `expModel` filter queries):

- **GPT120B** (CST): `PAYTM_RU_CONTEXTUAL_PROMPT`, `PAYTM_RU_CONTEXTUAL_EXP_PROMPT`, `UPI_CONTEXTUAL_PROMPT`, `UPI_CONTEXTUAL_EXP_PROMPT`, `PAYTM_TRAVEL_CONTEXTUAL_PROMPT`, `PAYTM_PL_CONTEXTUAL_PROMPT`, `PAYTM_PROFILE_CONTEXTUAL_PROMPT`, `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT`, `PAYTM_INVESTMENT_CONTEXTUAL_LANG_EXP_PROMPT`, `PAYTM_LAMF_CONTEXTUAL_PROMPT`, `PAYTM_SILVER_CONTEXTUAL_PROMPT`, `PAYTM_SILVER_CONTEXTUAL_PROMPT_EXP`, `PAYTM_ONDC_CONTEXTUAL_PROMPT`, `DEVICE_CONTEXTUAL_PROMPT`, `LENDING_CONTEXTUAL_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_PROMPT`, `Settlement_Contextual_Transient_Experiment_Prompt`, `WEALTH_CONTEXTUAL_PROMPT`
- **LLAMA70B** (CST): `PAYTM_RU_CONTEXTUAL_PROMPT`, `PAYTM_RU_CONTEXTUAL_EXP_PROMPT`, `UPI_CONTEXTUAL_PROMPT`, `PAYTM_TRAVEL_CONTEXTUAL_PROMPT`, `PAYTM_PL_CONTEXTUAL_PROMPT`, `PAYTM_PROFILE_CONTEXTUAL_PROMPT`, `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT`, `PAYTM_CREDIT_LINE_CONTEXTUAL_PROMPT`, `PAYTM_CREDIT_LINE_CONTEXTUAL_PROMPT_EXP`, `PAYTM_INSURANCE_CONTEXTUAL_PROMPT`, `PAYTM_INSURANCE_CONTEXTUAL_EXP_PROMPT`, `PAYTM_ONDC_CONTEXTUAL_PROMPT`, `DEVICE_CONTEXTUAL_PROMPT`, `LENDING_CONTEXTUAL_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_PROMPT`, `Settlement_Contextual_Transient_Experiment_Prompt`
- **GEMMA27B** (CST): `PAYTM_RU_CONTEXTUAL_PROMPT_GEMMA`, `PAYTM_TRAVEL_CONTEXTUAL_PROMPT`, `PAYTM_PL_CONTEXTUAL_PROMPT`, `PAYTM_PROFILE_CONTEXTUAL_PROMPT`, `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT`, `PAYTM_INVESTMENT_CONTEXTUAL_PROMPT_GEMMA`, `PAYTM_ONDC_CONTEXTUAL_PROMPT`
- **AGENTIC_GPT** (CST): `UPI_CONTEXTUAL_EXP_PROMPT`
- **SB_LORA** (CST): `DEVICE_CONTEXTUAL_PROMPT`
- **BL_LORA** (CST): `LENDING_CONTEXTUAL_PROMPT`

---

### §A3.3 — Pre-flight Rule: Model-Level Queries

When the user asks for analysis by **model** (`expModel`), always:
1. Determine the vertical (MHD or CST) from context or the `cst_entity` values.
2. Look up §A3.1 (MHD) or §A3.2 (CST) reverse lookup to find all `expPrompt` values where that model appears.
3. Add **both** filters: `expModel = '...'` AND `expPrompt IN ('prompt1', 'prompt2', ...)`
4. If the user is comparing two models, use separate CTEs or CASE expressions — do not mix sessions with different prompts unless the user explicitly wants the full scope.

**Example** — "GPT120B vs LLAMA70B eval score for Soundbox (MHD) in March 2026":
```sql
-- expPrompt IN = prompts where BOTH models appear for Soundbox
WHERE a.cst_entity IN ('p4bsoundbox','p4bAIBot','p4bedc')
  AND b.expModel IN ('GPT_OSS_120B_INVOKE_STREAM','TFY_LLAMA_3_3_70B_STREAM')
  AND b.expPrompt IN (
    'DEVICE_CONTEXTUAL_PROMPT','SETTLEMENT_CONTEXTUAL_PROMPT',
    'LENDING_CONTEXTUAL_PROMPT','P4B_PROFILE_CONTEXTUAL_PROMPT',
    'WEALTH_CONTEXTUAL_PROMPT','DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA',
    'Lending_Contextual_Experiment_Prompt','SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT'
  )
```

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
0. **Entity + L1 resolution (always first):** Look up §A1 — what `cst_entity` does the user's question refer to? Set the exact entity filter from that table. If the user mentions a specific issue type or L1 label, look it up in §A2 for that entity — find the closest matching stored label, then build the LIKE pattern from the **full label text**: lowercase, replace ` - ` with `%`, wrap in `%...%` (e.g. `"Payout Success - Amount not Credited"` → `LIKE '%payout success%amount not credited%'`). Never guess a cst_entity value or an L1 string — always derive from §A1/§A2. Never use just 2-3 words from the middle of a label — use the full label to avoid ambiguous matches.
1. Does the entity start with `p4b`? → use `hive.mhd_crm_cst` + `hive.mhd_cst_ticket` for ALL tables.
2. Does the question ask for daily/day-wise/per-day/over N days/trend? → `DATE(s.created_at)` in SELECT + `GROUP BY 1`.
3. Does the query need percentages? → use `* 100.0` (not `* 1.0`), `ROUND(..., 2)`, `_pct` suffix.
4. Does the query include score columns (eval_score, empathy_score etc.)? → multiply by `100.0` and `COALESCE(..., 0)`.
5. Is the DevRev CTE included? → NO `cst_entity` filter on it, only `dl_last_updated` + date range.
6. Is the conversation table needed? → always create a separate `messages_data` CTE with `ticket_id IN (SELECT id FROM session_data)`, never inline join it.
7. Every `session_data` CTE MUST include `AND id NOT LIKE '2-%'` AND `AND source = 100` — without these you will include phone/email/WhatsApp sessions.
8. Does the query involve function call success rates or any JSON-derived value used in a COUNT? → Pre-extract those values as named columns in `final1` CTE first (§0.17). Never call `JSON_EXTRACT_SCALAR` inside a `COUNT(DISTINCT CASE WHEN ...)` — it always returns NULL.
10. Does the final SELECT contain `GROUP BY`? → Verify that the positional columns in `GROUP BY 1, 2` are non-aggregate scalar expressions (date, entity). If the SELECT starts with `COUNT(...)`, Trino throws `EXPRESSION_NOT_SCALAR` (§0.15). Always list dimension columns first.
9. Does the query unwrap `plugservice_response`? → Use **single** backslash `'\'` in REPLACE and `'\['`/`'\{'` in REGEXP_REPLACE patterns. Double backslash `'\\'` silently breaks all JSON extraction → all `_status` columns return NULL. Also wrap REGEXP_REPLACE inside an inner `sub` subquery with `GROUP BY` in the `vertical` CTE (§14.2).
11. Does the question mention "soundbox", "device", "EDC", "card machine", or any ACPS function related to device? → Filter `session_data` by `cst_entity IN ('p4bsoundbox', 'p4bAIBot', 'p4bedc')` — **NEVER** just `= 'p4bsoundbox'` alone. All three entities share the same bot prompt and represent the same device intent (§6.2).
12. Before returning any query — self-check: (a) does `messages_data` include `ticket_id, message_id, role, content, type`? (b) does every CTE reference only columns that exist in the tables it selects from? (c) are there any emojis inside the SQL text or comments? (d) do any SQL string literals contain Unicode typographic characters (en dash `–`, em dash `—`, curly quotes `'` `"` `"`, non-breaking space, ellipsis `…`, math minus `−`)? Replace all with plain ASCII equivalents before returning. (e) **BACKSLASH SCAN — if the query contains any REGEXP_REPLACE**: scan every regex pattern string for `\\[`, `\\]`, `\\{`, `\\}`, `\\(`, `\\)` — if any are found, replace with `\[`, `\]`, `\{`, `\}`, `\(`, `\)`. Trino SQL REGEXP_REPLACE uses Java regex; SQL string literals do NOT need double-escaping of brackets/braces. Double backslash (`\\[`) matches a literal backslash followed by `[`, not a literal `[` — this silently breaks all JSON extraction and makes every status column NULL. Single backslash (`\[`) is always correct. (f) **EXPERIMENT QUERY COLUMN CHECK — if `messages_data` is shared between `model_base` and `grouped_sess`**: verify `messages_data` includes ALL of `ticket_id, message_id, role, content` (needed by grouped_sess) AND `expModel, expPrompt` (needed by model_base). The most common error is defining messages_data with only experiment columns (`ticket_id, role, expModel`) and forgetting `message_id` and `content` — this causes `COLUMN_NOT_FOUND` on `m.message_id` and `m.content` inside grouped_sess. Fix any issue before returning. (g) **`llm_model` COALESCE CHECK — if the query extracts `expModel` from the conversation table**: verify `expModel` is built as `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model)` — NOT `json_extract_scalar(meta, '$.expModel')` alone. `llm_model` is a direct column on `ticket_session_conversation_snapshot_v3` and is the fallback model for sessions not enrolled in any experiment. Omitting it causes non-experiment sessions to get NULL expModel and silently disappear from all model-level analysis. If you see `json_extract_scalar(meta, '$.expModel') AS expModel` anywhere without the COALESCE wrapper, fix it before returning.
13. Does the question mention "agent handover attempts", "agent handover success rate", or "how often the handover function succeeded/failed"? → Use the `vertical` CTE (joined from `vertical_analytics_data_snapshot_v3`) — this holds Paytm's function call data (`workflow LIKE '%ACPS_agent_handover%'`). Do NOT use the DevRev table for this. Does the question ask for "agent handover count", "how many sessions were handed over", or "escalation count"? → Use the `devrev` CTE (`fd_ticket_id IS NOT NULL`) — this is the ticket ingested from the DevRev platform by Paytm's support team after a handover completes. The two tables measure different things (§7c).
14. Does the question filter on a specific L1/L2 issue label (`out_key_problem_desc`, `out_key_sub_issue_desc`)? → NEVER use `=`. Look up the entity's labels in §A2 and find the closest matching stored label. Build the LIKE pattern from the **full label**: lowercase the entire label, replace every ` - ` with `%`, wrap in `%...%`. Example: stored `"Payout Success - Amount not Credited"` → `LIKE '%payout success%amount not credited%'`. This gives exact-match specificity (only one L1 can match) while handling Unicode dashes and casing. Do NOT use just 2-3 words — a short keyword is ambiguous and may match unintended labels. See §0.2c.
15. Does the question ask for analysis **by model** (`expModel`) or **by prompt** (`expPrompt`)? → This is a mandatory lookup, not a hint. Follow these steps exactly — the same discipline as looking up L1 labels in §A2:
   (a) Identify the vertical: does the query entity start with `p4b`? → MHD (use §A3.1). Otherwise → CST (use §A3.2).
   (b) Use the **model→prompts reverse lookup** at the bottom of §A3.1 or §A3.2 to find every `expPrompt` value where that model appears. Copy the exact strings — do not paraphrase or abbreviate.
   (c) Add BOTH filters to the query: `expModel = '<full-model-name>'` AND `expPrompt IN ('<prompt1>', '<prompt2>', ...)`. Use the full model name from the alias table at the top of §A3, not the shorthand.
   (d) If the query asks about a specific entity (e.g. Soundbox → `p4bsoundbox, p4bAIBot, p4bedc`), cross-check the §A3.1 prompt table to confirm those entities appear in each prompt in your `IN` list. Exclude any prompt where those entities are not listed.
   (e) Never filter by `expModel` alone. The same model runs on many different prompts; filtering by model only mixes sessions from unrelated experiments and produces meaningless averages. There is no valid reason to omit the `expPrompt IN (...)` filter from a model-level query.

   **Example — "GPT120B eval score for Soundbox (MHD) last 7 days":**
   Step (a): Soundbox entities are `p4b*` → MHD → use §A3.1.
   Step (b): §A3.1 GPT120B reverse lookup → `DEVICE_CONTEXTUAL_PROMPT`, `DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA`, `LENDING_CONTEXTUAL_PROMPT`, `Lending_Contextual_Experiment_Prompt`, `LENDING_CONTEXTUAL_LANG_EXP_PROMPT`, `SETTLEMENT_CONTEXTUAL_PROMPT`, `SETTLEMENT_CONTEXTUAL_EXPERIMENT_PROMPT`, `SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT`, `P4B_PROFILE_CONTEXTUAL_PROMPT_LANGUAGE_EXPERIMENT`, `WEALTH_CONTEXTUAL_PROMPT`, `WEALTH_CONTEXTUAL_LANG_EXP_PROMPT`.
   Step (c)+(d): All these prompts include p4bsoundbox → keep all. Add to WHERE:
   ```sql
   AND mb.expModel = 'GPT_OSS_120B_INVOKE_STREAM'
   AND mb.expPrompt IN (
     'DEVICE_CONTEXTUAL_PROMPT','DEVICE_CONTEXTUAL_PROMPT_EXPERIMENT_HARWARE_JINJA',
     'LENDING_CONTEXTUAL_PROMPT','Lending_Contextual_Experiment_Prompt',
     'LENDING_CONTEXTUAL_LANG_EXP_PROMPT','SETTLEMENT_CONTEXTUAL_PROMPT',
     'SETTLEMENT_CONTEXTUAL_EXPERIMENT_PROMPT','SETTLEMENT_CONTEXTUAL_COLLECTION_PILLS_PROMPT',
     'P4B_PROFILE_CONTEXTUAL_PROMPT','P4B_PROFILE_CONTEXTUAL_PROMPT_LANGUAGE_EXPERIMENT',
     'WEALTH_CONTEXTUAL_PROMPT','WEALTH_CONTEXTUAL_LANG_EXP_PROMPT'
   )
   ```

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
- Write a SELECT that starts with aggregate columns when `GROUP BY` is present — always put dimension columns (`DATE(created_at)`, `cst_entity`) first so `GROUP BY 1, 2` resolves to scalars, not aggregates (§0.15).
- Call `JSON_EXTRACT_SCALAR` inside a `COUNT(DISTINCT CASE WHEN ...)` expression — this always returns NULL. Pre-extract as a named column in `final1` first (§0.17).
- Use `'\\'` (double backslash) in the `plugservice_response` REPLACE/REGEXP_REPLACE unwrap — use `'\'` (single backslash). Double backslash silently breaks all JSON extraction, making every `_status` column NULL (§14.2).
- Write `'\\['`, `'\\]'`, `'\\{'`, `'\\}'` in any Trino REGEXP_REPLACE pattern — always write `'\['`, `'\]'`, `'\{'`, `'\}'`. This is not Python or JavaScript: Trino SQL string literals do not need double-escaping for regex metacharacters. Double backslash makes the regex match a literal backslash character, not the intended bracket/brace, and every nested JSON field stays double-encoded. Pre-flight check (e) will catch this — but never write it in the first place.
- UNION ALL directly from `final1` 26 times for a function-level output — aggregate all functions wide into a single `agg` CTE first, then UNION ALL from `agg`. Repeated CTE references multiply stages and hit the 200-stage Trino limit (§0.18).
- Do `JSON_EXTRACT_SCALAR` inside the `vertical` CTE or use column aliases in its `GROUP BY` — `vertical` exposes exactly 6 columns via `GROUP BY 1,2,3,4,5,6`, all JSON extraction belongs in `final1` (§14.2).
- Write the `vertical` CTE without an inner subquery + GROUP BY — always wrap REGEXP_REPLACE in a `sub` subquery and GROUP BY the outer columns (§14.2).
- Return only derived metrics without base count columns.
- Filter a soundbox/device/EDC query with `cst_entity = 'p4bsoundbox'` alone — always use `cst_entity IN ('p4bsoundbox', 'p4bAIBot', 'p4bedc')` to capture agent handover and EDC escalation sessions (§6.2).
- Omit `role` (or any other standard column) from the `messages_data` CTE — always select `ticket_id, message_id, role, content, type` as the minimum base set. When experiment analysis is needed, also add `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel` and `json_extract_scalar(meta, '$.expPrompt') AS expPrompt`. Missing `role` breaks `grouped_sess`; missing `llm_model` (via the COALESCE) silently drops all non-experiment sessions from model analysis (§0.11, §15.3).
- Define `messages_data` with only experiment columns (`ticket_id, role, expModel, expPrompt`) when the same CTE is also used by `grouped_sess` — this causes `COLUMN_NOT_FOUND` on `m.message_id` and `m.content`. When `messages_data` serves both `model_base` AND `grouped_sess`, it must include the full merged column set: `ticket_id, message_id, role, content` (base) + `expModel, expPrompt` (experiment). The experiment columns are added ON TOP of the base set, never replacing them (§15.3).
- Filter by `expModel` alone without also filtering `expPrompt` — the same model runs on many different prompts; filtering by model only mixes sessions from different experiments, producing meaningless averages. Always look up §A3 to find the matching prompts and add `expPrompt IN (...)` alongside `expModel = '...'`. This is mandatory — not optional — for every model-level query (pre-flight item 15).
- Use `json_extract_scalar(meta, '$.expModel') AS expModel` without wrapping in `COALESCE(..., llm_model)` — non-experiment sessions store the model in the `llm_model` column directly, not in `meta`. Without the fallback, those sessions get NULL expModel, pass the `WHERE expModel IS NOT NULL` filter as excluded, and disappear from all model-level analysis. Always write `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel`.
- Use emojis (🔹, 1️⃣, ✅, ❌, etc.) anywhere inside SQL query text or SQL comments — emojis may appear only in the plain-text report or explanation, never inside a query string.
- Use Unicode typographic characters inside SQL string literals — en dash `–` (U+2013), em dash `—` (U+2014), curly/smart quotes `'` `"` `"` (U+2018/2019/201C/201D), non-breaking space (U+00A0), ellipsis `…` (U+2026), or math minus `−` (U+2212). These look identical to ASCII in text output but silently return zero rows in Trino string comparisons. Always replace with plain ASCII: `–`/`—` → `-`, smart quotes → straight quotes, non-breaking space → regular space, `…` → `...` (§0.2c).
- Use `=` exact match to filter `out_key_problem_desc` or `out_key_sub_issue_desc` — always use `LOWER(column) LIKE '%keyword%'`. Exact match fails silently when the user's value has Unicode characters, different casing, or is a partial label copied from a prior result (§0.2c).
- Use the `devrev` CTE (fd_ticket_id) to measure agent handover **attempts or success rate** — the DevRev table only records tickets that were created after a completed handover; it cannot tell you how many times the bot tried or whether the ACPS function succeeded. Use the `vertical` CTE for attempts and success rate (§7c).
- Use the `vertical` CTE to count "how many sessions had an agent handover" as a simple session count — use `fd_ticket_id IS NOT NULL` on the devrev CTE for that. The vertical table is for function call attempt/success metrics, not session-level escalation counts (§7c).

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

### 0.2c Safe L1/L2 String Matching — Unicode & Partial Input Guardrail

**The problem:** L1/L2 labels (`out_key_problem_desc`, `out_key_sub_issue_desc`) are free-text strings stored in Trino with plain ASCII characters. However:

1. **Your own analysis text uses typographic Unicode.** When you write "Payout Success – Amount not Credited" in a response, the `–` is an **en dash (U+2013)**. When that label is then reused in a SQL WHERE clause, the en dash does not match the plain hyphen `-` (U+002D) stored in Trino. Zero rows are returned with no error. This is the most common silent failure pattern for L1/L2 filters.

2. **Users copy-paste or type partial values.** A user may type "Amount not Credited" instead of the full label, or copy from a table in a prior response.

3. **Casing is inconsistent.** The eval pipeline may store labels in mixed, lower, or title case.

**Unicode characters that silently break SQL string comparisons:**

| Character | Unicode | What it looks like | Safe ASCII |
|---|---|---|---|
| En dash | U+2013 | `–` | `-` |
| Em dash | U+2014 | `—` | `-` |
| Right curly apostrophe | U+2019 | `'` | `'` |
| Left/right double quotes | U+201C/D | `"` `"` | `"` |
| Non-breaking space | U+00A0 | ` ` (invisible) | regular space |
| Ellipsis | U+2026 | `…` | `...` |
| Math minus | U+2212 | `−` | `-` |

**The correct pattern — full-label LIKE using §A2:**

Now that §A2 contains the exact stored label for every MHD entity, you must look up the label there and build the LIKE pattern from the **full label text**, not just 2-3 words. Using the full label gives near-exact specificity (only one row in the entire L1 list will match) while still handling dash encoding and case variation.

**How to build the pattern from a §A2 label:**
1. Find the exact stored label in §A2 for the relevant entity.
2. Lowercase the entire label.
3. Replace every ` - ` (space-dash-space) with `%` — this handles the hyphen vs en dash problem at the separator, and also handles labels that use different separators.
4. Wrap in `%...%`.

```sql
-- §A2 stored label: "Payout Success - Amount not Credited"
-- Step 1: lowercase  → "payout success - amount not credited"
-- Step 2: " - " → "%"  → "payout success%amount not credited"
-- Step 3: wrap         → '%payout success%amount not credited%'
AND LOWER(f.out_key_problem_desc) LIKE '%payout success%amount not credited%'

-- §A2 stored label: "Soundbox Device not turning on - charger connected"
AND LOWER(f.out_key_problem_desc) LIKE '%soundbox device not turning on%charger connected%'

-- §A2 stored label: "Transaction Status - Failed"
AND LOWER(f.out_key_problem_desc) LIKE '%transaction status%failed%'
```

**Why this is better than 2-3 words:** `LIKE '%amount not credited%'` would match any future L1 label that happened to contain those words. `LIKE '%payout success%amount not credited%'` matches exactly one label in the entire dataset — it is as specific as an exact match, but immune to Unicode dashes and casing.

**When the user provides a partial or approximate label** (not an exact §A2 match), find the closest entry in §A2 for the relevant entity and use that label's full-label LIKE pattern — do not use the user's partial wording directly.

**When no §A2 entry exists** (CST entities, or unknown label) — fall back to the most distinctive 2-3 consecutive words from the user's input, lowercase, with `%` in place of punctuation.

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
-- Mandatory minimum columns for a standard query:
--   ticket_id, message_id, role, content, type
-- When experiment columns (expModel, expPrompt) are also needed, ALWAYS add:
--   COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel
--   json_extract_scalar(meta, '$.expPrompt')                     AS expPrompt
-- NOTE: llm_model is a direct column on the table — it is the fallback when meta.expModel
-- is absent (sessions not enrolled in any experiment). NEVER use json_extract_scalar alone
-- for expModel — ALWAYS use COALESCE(..., llm_model) so non-experiment sessions are included.
messages_data AS (
    SELECT ticket_id, message_id, role, content, type
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

### 0.12 Global Bot Session Filters — Always Apply to `support_ticket_details`

The `support_ticket_details_snapshot_v3` table contains sessions from ALL channels —
bot, phone, email, WhatsApp, etc. **Without these two filters you will include
non-bot sessions in every metric**, inflating counts and distorting all rates.

Always add both filters to every `session_data` CTE:

```sql
session_data AS (
    SELECT DISTINCT id, created_at, merchant_id, cst_entity
    FROM hive.mhd_crm_cst.support_ticket_details_snapshot_v3
    WHERE dl_last_updated >= DATE '2025-01-01'
      AND DATE(created_at) BETWEEN DATE '{since}' AND DATE '{until}'
      AND id NOT LIKE '2-%'   -- excludes non-bot session IDs (phone, email, WA etc.)
      AND source = 100        -- 100 = bot channel only
)
```

| Filter | What it excludes |
|--------|-----------------|
| `id NOT LIKE '2-%'` | Non-bot sessions — IDs starting with `2-` belong to phone/email/WhatsApp channels |
| `source = 100` | Only bot-originated sessions; other source values = other channels |

Both filters must always appear together. Omitting either will silently include
non-bot traffic and corrupt all session counts and derived metrics.

### 0.13 Schema Routing — `p4b*` Entities Are ALWAYS Merchant (mhd_crm_cst)

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

### 0.14 Daily / Day-wise Queries — Always GROUP BY Date

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

### 0.15 `GROUP BY` Positional References Must Point to Non-Aggregate Columns

`GROUP BY 1, 2` means column positions 1 and 2 in the SELECT. **Those columns must be
non-aggregate expressions** — scalar values like `DATE(created_at)`, `cst_entity`, a literal, etc.
If columns 1 or 2 are `COUNT(...)`, `SUM(...)`, or any aggregate, Trino throws
`EXPRESSION_NOT_SCALAR`.

This error most often happens when the grouping dimension columns (`DATE(created_at)`, `cst_entity`)
are forgotten from the SELECT entirely, leaving only aggregate columns — so `GROUP BY 1` ends up
pointing to a `COUNT(...)`.

```sql
-- ❌ WRONG — GROUP BY 1, 2 points to COUNT() expressions → EXPRESSION_NOT_SCALAR
SELECT
    COUNT(DISTINCT id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN user_msg > 0 THEN id END) AS active_sessions,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_%' THEN id END) AS attempts
FROM final1
GROUP BY 1, 2   -- columns 1 and 2 are COUNT() — this crashes

-- ✅ CORRECT — dimension columns first, aggregates after
SELECT
    DATE(created_at) AS session_date,   -- col 1: scalar ✓
    cst_entity,                          -- col 2: scalar ✓
    COUNT(DISTINCT id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN user_msg > 0 THEN id END) AS active_sessions,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_%' THEN id END) AS attempts
FROM final1
GROUP BY 1, 2   -- correct: date and entity
ORDER BY 1 DESC, 2
```

**Rule:** Always put the grouping dimension columns (`DATE(created_at)`, `cst_entity`, etc.) as the
**first columns** in SELECT so that `GROUP BY 1, 2` always resolves to scalar expressions.
Never write a SELECT that starts with an aggregate when `GROUP BY` is present.

### 0.17 Never Inline JSON Extraction Inside `COUNT(DISTINCT CASE WHEN ...)` — Pre-Extract in a CTE First

This is the **root cause of function call success counts returning NULL**.

When you call `JSON_EXTRACT_SCALAR(...)` or `LOWER(JSON_EXTRACT_SCALAR(...))` directly inside a
`COUNT(DISTINCT CASE WHEN <extraction> = 'success' THEN id END)` expression inside an aggregating
SELECT, Trino evaluates the extraction across grouped rows and cannot resolve the scalar correctly —
the result is always `NULL` or `0`.

**The fix is mandatory:** extract every JSON-derived value as a named column in an intermediate CTE
(e.g. `final1`), then reference the column name in the outer SELECT's COUNT expressions.

```sql
-- ❌ WRONG — JSON_EXTRACT_SCALAR inline inside COUNT returns NULL
SELECT
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseServiceRequest%'
        AND LOWER(JSON_EXTRACT_SCALAR(plugservice_response,
              '$.data.action_response.raiseServiceRequest.FCResponse.status'))
              = 'service request is raised'
        THEN id END) AS raiseServiceRequest_success   -- always NULL
FROM final1
GROUP BY 1, 2

-- ✅ CORRECT — extract status as a column in final1, reference by name in outer SELECT
-- Step 1: final1 CTE — pre-extract all status columns
final1 AS (
    SELECT
        a.id,
        a.cst_entity,
        a.created_at,
        b.workflow,
        b.plugservice_response,
        LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response,
            '$.data.action_response.raiseServiceRequest.FCResponse.status'))
            AS raiseServiceRequest_status,
        -- ... one column per ACPS function ...
    FROM session_data a
    LEFT JOIN vertical b ON a.id = b.ticket_id
)

-- Step 2: outer SELECT — reference the pre-extracted column name
SELECT
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseServiceRequest%'
        THEN id END) AS raiseServiceRequest_attempts,
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_raiseServiceRequest%'
        AND raiseServiceRequest_status = 'service request is raised'
        THEN id END) AS raiseServiceRequest_success
FROM final1
GROUP BY 1, 2
```

**Rule:** For every ACPS function, define a `<function>_status` column in `final1` using
`LOWER(JSON_EXTRACT_SCALAR(...))`. The outer SELECT must reference those column names directly —
never call `JSON_EXTRACT_SCALAR` inside a `COUNT` or aggregation expression.

This applies to ALL JSON-derived values used in conditional counting, not just function call status.

### 0.18 Never UNION ALL From a CTE More Than Once — Use a Pre-Aggregated Pivot CTE Instead

**Error:** `QUERY_HAS_TOO_MANY_STAGES` — Number of stages exceeds allowed maximum (200).

This happens when a CTE like `final1` is referenced in 26 separate `UNION ALL` branches
(one per function). Trino does not cache CTEs — each reference re-runs the full pipeline.
26 UNION ALL branches × ~10 stages each = 260+ stages → query rejected.

```sql
-- ❌ WRONG — final1 referenced 26 times → QUERY_HAS_TOO_MANY_STAGES
function_metrics AS (
    SELECT 'planUpgrade_soundbox_offers', COUNT(DISTINCT ...) FROM final1
    UNION ALL
    SELECT 'checkSoundboxHardwareStatus', COUNT(DISTINCT ...) FROM final1
    -- × 26 ... each FROM final1 re-runs the entire CTE pipeline
)
```

**Correct pattern — two steps:**

**Step 1:** Aggregate ALL functions in one wide CTE (`agg`) with a single pass over `final1`:
```sql
agg AS (
    SELECT
        COUNT(DISTINCT CASE WHEN user_msg >= 1 THEN id END) AS active_sessions,
        COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%' THEN id END) AS planUpgrade_soundbox_offers_attempts,
        COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%' AND planUpgrade_soundbox_offers_status = 'success' THEN id END) AS planUpgrade_soundbox_offers_success,
        -- ... all 26 functions as columns ...
    FROM final1
)
```

**Step 2:** UNION ALL 26 rows from `agg` — each branch is just a cheap column projection from a single pre-aggregated row:
```sql
SELECT function_name, attempts, successes, active_sessions
FROM (
    SELECT 'planUpgrade_soundbox_offers' AS function_name,
           planUpgrade_soundbox_offers_attempts AS attempts,
           planUpgrade_soundbox_offers_success  AS successes,
           active_sessions FROM agg
    UNION ALL
    SELECT 'checkSoundboxHardwareStatus',
           checkSoundboxHardwareStatus_attempts,
           checkSoundboxHardwareStatus_success,
           active_sessions FROM agg
    -- × 26 — but agg is ONE row, each branch is O(1), stages stay low
)
ORDER BY attempts DESC
```

**Why this works:** `final1` is referenced only once (inside `agg`). `agg` produces a single row.
Each UNION ALL branch is a trivial column rename from that one materialized row — Trino can handle
26 projections from a single row without creating extra execution stages.

**Rule:** Whenever you need function-level rows (one row per function), always aggregate wide first
into a single-row `agg` CTE, then UNION ALL from `agg` for the row-per-function format. Never
UNION ALL directly from `final1` or any row-level CTE.

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
  - `meta` — JSON blob with UI metadata and experiment fields (`expModel`, `expPrompt`, `llmEndPoint`, `intent`). Use `json_extract_scalar(meta, '$.expModel')` etc. to unpack.
  - `llm_model` — direct column; the model identifier for sessions NOT enrolled in an experiment. Use `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel` to get model for ALL sessions. Never use `json_extract_scalar(meta, '$.expModel')` alone — non-experiment sessions have NULL in meta and will be excluded.
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

### 6.2 Soundbox / Device Entity Group — Always Query All Three Together

The soundbox/device bot runs from a **single shared prompt**. A session can be tagged with any of three `cst_entity` values depending on what action the user took, but all three represent the same device intent:

| `cst_entity` | When it appears |
|---|---|
| `p4bsoundbox` | **Default** — any device session. Stays as the entity even if the user creates a service ticket for a soundbox device (devrev record is created but entity stays `p4bsoundbox`). |
| `p4bedc` | Session where the device is an **EDC / card machine** AND the user raised a service request. Entity updates from `p4bsoundbox` → `p4bedc` at the point the service ticket is raised. |
| `p4bAIBot` | Session where the user requested **agent handover** (no service ticket raised). Entity flips from `p4bsoundbox` → `p4bAIBot` at the point of handover. |

**Rule: Any query about soundbox, device, EDC, or any ACPS function must scope `session_data` with:**
```sql
AND cst_entity IN ('p4bsoundbox', 'p4bAIBot', 'p4bedc')
```

```sql
-- ❌ WRONG — misses all agent handover sessions (tagged p4bAIBot) and EDC escalations (tagged p4bedc)
WHERE cst_entity = 'p4bsoundbox'

-- ✅ CORRECT — covers the full device funnel across all outcome paths
WHERE cst_entity IN ('p4bsoundbox', 'p4bAIBot', 'p4bedc')
```

This applies to ALL device-related queries: function call success rates, session counts, escalation rates, eval scores, L1/L2 issue tags — any metric where the user says "soundbox", "device", "EDC", "card machine", or references any ACPS function.

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
| Agent handover **count** / sessions escalated / DevRev ticket raised | `session_data` + `devrev` CTE (`fd_ticket_id IS NOT NULL`) |
| Agent handover **attempts or success rate** (function call level) | `session_data` + `vertical` CTE (`workflow LIKE '%ACPS_agent_handover%'`) — see §7c |
| MSAT (Happy/Sad/Skip) | `session_data` + `feedback_status` CTE (`ticket_meta_snapshot_v3`) |
| Conversation messages / transcript | `session_data` + direct JOIN to `ticket_session_conversation_snapshot_v3` |
| Workflow, intent, plugin data | `session_data` + direct JOIN to `vertical_analytics_data_snapshot_v3` |
| Bounced vs active sessions | `session_data` + `grouped_sess` CTE (counts user messages) |

Always start from `session_data` (the base session table) and LEFT JOIN outward. Never drive the query from the feedback or eval table.

---

## 7c. Agent Handover — Two Different Metrics, Two Different Tables

There are **two distinct concepts** both called "agent handover". Always clarify which one the user wants before writing SQL.

### What each table measures

| Metric | Table | How |
|--------|-------|-----|
| **Handover attempts** — how many times the bot called the ACPS agent_handover function | `vertical_analytics_data_snapshot_v3` via `vertical` CTE | `workflow LIKE '%ACPS_agent_handover%'` |
| **Handover success rate** — what fraction of those function calls returned `status = success` | `vertical_analytics_data_snapshot_v3` via `vertical` CTE | `agent_handover_status = 'success'` (pre-extracted in `final1`) |
| **Handover count (session level)** — how many sessions resulted in a ticket being raised on DevRev | `support_ticket_details_snapshot_v3` (DevRev schema) via `devrev` CTE | `fd_ticket_id IS NOT NULL` |

### Why they are different

- The **`vertical` table** contains Paytm's bot function call log — one row per plugin/API call the bot made within a session. It records every time the bot *attempted* `ACPS_agent_handover`, and whether that attempt *succeeded* or *failed*. This data comes from Paytm's support team's own pipeline.
- The **`devrev` table** is ingested from the **DevRev platform** by their team. It only contains sessions where a ticket was actually created and synced from DevRev — i.e., a completed, confirmed handover. It says nothing about attempts or failures.

A session can have:
- Multiple `ACPS_agent_handover` attempts in `vertical` (bot retried), but only one `fd_ticket_id` (or none if all attempts failed).
- An `fd_ticket_id` without a matching `ACPS_agent_handover` row in `vertical` (edge case: ticket created through a different path).

### Query patterns

**Handover attempts + success rate (vertical table):**
```sql
-- In final1 CTE, pre-extract the status (§0.17):
JSON_EXTRACT_SCALAR(b.plugservice_response,
    '$.data.action_response.agent_handover.FCResponse.status')
        AS agent_handover_status,

-- In the SELECT / agg:
COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
    THEN id END)                             AS agent_handover_attempts,
COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
    AND agent_handover_status = 'success'
    THEN id END)                             AS agent_handover_success,
ROUND(
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
        AND agent_handover_status = 'success' THEN id END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_agent_handover%'
        THEN id END), 0), 2)                 AS agent_handover_success_pct
```
Join: `LEFT JOIN vertical b ON a.id = b.ticket_id`

**Handover count / escalation count (devrev table):**
```sql
COUNT(DISTINCT CASE WHEN d.fd_ticket_id IS NOT NULL THEN s.id END) AS handover_sessions
```
Join: `LEFT JOIN devrev d ON s.id = d.id`

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

## 14. Function Calls, Workflows & Plugin Response

This section covers the `vertical_analytics_data_snapshot_v3` table in depth —
specifically how bot actions work, how to parse `plugservice_response`, and how
to calculate function call success rates.

---

### 14.1 Workflow Prefixes — `ACPS_` vs `CPS_`

Every bot action is identified by a `workflow` value in `vertical_analytics_data_snapshot_v3`.
There are two distinct prefixes with different meanings:

| Prefix | When it appears | What it represents |
|--------|----------------|--------------------|
| `CPS_` | When the bot loads **master data** because an intent was detected from a user message | Read-only data fetch — e.g. showing settlement status, soundbox details, loan info |
| `ACPS_` | When the bot **executes an action** on behalf of the user | Write/transactional operations — e.g. raising a service request, updating an address, initiating a callback |

**Key distinction:**
- `CPS_` = the bot understood the user's intent and fetched context data to show them. No user action taken.
- `ACPS_` = the bot attempted to perform a real action (API call with side effects). This is what has a success/failure outcome worth measuring.

**Only `ACPS_` workflows have a measurable success rate.** `CPS_` workflows are
informational and do not have a pass/fail outcome.

```sql
-- Filter to action workflows only
WHERE workflow LIKE '%ACPS_%'

-- Filter to master data fetch workflows only
WHERE workflow LIKE '%CPS_%' AND workflow NOT LIKE '%ACPS_%'
```

---

### 14.2 `plugservice_response` — Structure & Unwrapping

`plugservice_response` in `vertical_analytics_data_snapshot_v3` is a **double-encoded
JSON string** — the outer layer is a quoted/escaped string, not a native JSON object.
It must be cleaned before any `JSON_EXTRACT_SCALAR` calls will work.

#### Unwrapping pattern (MHD)

```sql
REGEXP_REPLACE(
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REPLACE(
                            CAST(substring(plugservice_response, 2, length(plugservice_response) - 2) AS VARCHAR),
                            '\', ''          -- strip escaped backslashes
                        ),
                        '"tags":"(\[.*?\])"',         '"tags":$1'
                    ),
                    '"xActionParams":"(\{.*?\})"',    '"xActionParams":$1'
                ),
                '"aiConversationData":"(\{.*?\})"',   '"aiConversationData":$1'
            ),
            '"cstMetadata":"(\{.*?\})"',              '"cstMetadata":$1'
        ),
        '"merchant_type":"(\[.*?\])"',                '"merchant_type":$1'
    ),
    'Other Issues', 'Other_Issues'   -- avoid spaces breaking JSON path parsing
) AS plugservice_response
```

**What each step does:**
1. `substring(..., 2, length-2)` — strips the outer wrapping characters (first and last char)
2. `REPLACE(..., '\', '')` — removes escape backslashes from the string
3. Each `REGEXP_REPLACE` — unescapes a specific nested JSON field that was double-encoded as a string (`"field":"{...}"` → `"field":{...}`)
4. Final replace — `"Other Issues"` → `"Other_Issues"` to prevent space in value from breaking path extraction

#### ⚠️ CRITICAL — Single backslash only, never double

The REPLACE **and every REGEXP_REPLACE pattern** must use **single backslash only**. Using double backslash (`\\`) is the most common cause of all success counts returning NULL.

This is a two-part trap the LLM frequently falls into:
- It may fix `REPLACE(..., '\', '')` correctly but still write `'"tags":"(\\[.*?\\])"'` with double backslash in the REGEXP_REPLACE patterns.
- **Both must be single backslash.** Fix one without the other and the JSON still stays malformed.

```sql
-- ❌ WRONG — double backslash in REPLACE and/or REGEXP_REPLACE
REPLACE(CAST(... AS VARCHAR), '\\', '')          -- wrong
'"tags":"(\\[.*?\\])"'                           -- wrong
'"xActionParams":"(\\{.*?\\})"'                  -- wrong

-- ✅ CORRECT — single backslash everywhere
REPLACE(CAST(... AS VARCHAR), '\', '')            -- correct
'"tags":"(\[.*?\])"'                              -- correct
'"xActionParams":"(\{.*?\})"'                     -- correct
```

When `'\\'` is used in REPLACE, it looks for two consecutive backslashes and finds none — escape chars stay, JSON is malformed. When `'\\['` is used in REGEXP_REPLACE, the regex is wrong and the nested JSON field stays double-encoded. Either way, every downstream `JSON_EXTRACT_SCALAR` silently returns NULL. Attempt counts will still be non-zero (from `workflow LIKE '%ACPS_...%'`), but every success count will be 0 and every `_status` column NULL.

#### ⚠️ CRITICAL — `vertical` CTE structure: REGEXP_REPLACE only, 6-column GROUP BY, no JSON extraction

The `vertical` CTE has **one job**: clean `plugservice_response` and deduplicate. It must:
1. Apply REGEXP_REPLACE inside an inner `sub` subquery
2. Expose exactly **6 columns**: `created_at`, `ticket_id`, `message_id`, `cst_entity`, `workflow`, `plugservice_response`
3. GROUP BY positional `1, 2, 3, 4, 5, 6` — never by aliases

**JSON extraction (`JSON_EXTRACT_SCALAR`) belongs ONLY in `final1`, never in `vertical`.**

```sql
-- ❌ WRONG — JSON extraction in vertical, alias used in GROUP BY → COLUMN_NOT_FOUND
vertical AS (
    SELECT ..., workflow,
           LOWER(JSON_EXTRACT_SCALAR(plugservice_response, '$.data.action_response.planUpgrade...')) AS planUpgrade_soundbox_offers_status
    FROM ( SELECT ... REGEXP_REPLACE(...) AS plugservice_response FROM ... ) sub
    GROUP BY 1, 2, 3, 4, 5,
             planUpgrade_soundbox_offers_status   -- ❌ alias in GROUP BY crashes
)

-- ❌ WRONG — no inner subquery, REGEXP_REPLACE directly in outer SELECT, no GROUP BY
vertical AS (
    SELECT ticket_id, workflow, REGEXP_REPLACE(...) AS plugservice_response
    FROM hive.mhd_crm_cst.vertical_analytics_data_snapshot_v3
    WHERE ...
)

-- ✅ CORRECT — REGEXP_REPLACE in sub, outer exposes 6 columns, GROUP BY 1,2,3,4,5,6
vertical AS (
    SELECT created_at, ticket_id, message_id,
           cst_entity, workflow, plugservice_response
    FROM (
        SELECT created_at,
               ticket_id,
               message_id,
               cst_entity,
               workflow,
               REGEXP_REPLACE(... ) AS plugservice_response   -- cleaning only
        FROM hive.mhd_crm_cst.vertical_analytics_data_snapshot_v3
        WHERE dl_last_updated >= DATE '...'
          AND DATE(created_at) >= DATE '...'
    ) sub
    GROUP BY 1, 2, 3, 4, 5, 6   -- positional only — 6 columns
)
-- JSON extraction happens AFTER this, in final1:
-- LOWER(JSON_EXTRACT_SCALAR(b.plugservice_response, '$.data.action_response....status'))
```

The mandatory CTE order for function call queries:
`session_data` → `messages_data` → `grouped_sess` → `vertical` (clean only) → `final1` (JSON extract) → `agg` (aggregate) → final SELECT

After unwrapping, extract fields using:
```sql
JSON_EXTRACT_SCALAR(plugservice_response, '$.data.action_response.<function_name>.<FCResponse|FEResponse>.status')
```

#### Response types

| Response type | Meaning |
|---------------|---------|
| `FCResponse` | Backend/server-side function response — e.g. settlement info, raise request, track changes |
| `FEResponse` | Frontend/UI-side response — e.g. show device list, plan upgrade display, test broadcast |

---

### 14.3 Function Call Success Rate — Metric Definition & Query Pattern

#### Definition

```
Function Call Attempts  = COUNT(DISTINCT session_id WHERE workflow LIKE '%ACPS_<function>%')
Function Call Successes = COUNT(DISTINCT session_id WHERE workflow LIKE '%ACPS_<function>%'
                              AND <function>_status = '<success_signal>')
Function Call Success Rate = successes / NULLIF(attempts, 0)
```

Important nuances:
- **Attempts and successes are both counted at session level** (`COUNT(DISTINCT id)`) — not at message level
- **Success signals vary by function** — most use `= 'success'` but some differ:
  - `raiseServiceRequest` → `= 'service request is raised'`
  - Always check the actual response value; do not assume `'success'` universally
- The status value is extracted with `LOWER(JSON_EXTRACT_SCALAR(...))` and compared in lowercase

#### Two-row pattern per function call

Each function in the final SELECT produces exactly **2 columns**: `<function>_attempts` and `<function>_success`. The rate is computed as:

```sql
ROUND(
    COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_<fn>%' AND <fn>_status = 'success' THEN id END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_<fn>%' THEN id END), 0),
2) AS <fn>_success_rate_pct
```

#### `function_call_failed` — bot-side failure signal

Sessions where the bot itself reported a failure can be counted via:
```sql
COUNT(DISTINCT CASE WHEN m.content LIKE '%Sorry we cannot complete the flow as of now%'
    THEN m.message_id END) AS function_call_failed
```
This counts messages where the bot showed the generic failure message — a separate
signal from API-level `status != 'success'`.

#### Full list of ACPS functions (MHD)

| Function name | Response type | Notes |
|---------------|--------------|-------|
| `planUpgrade_soundbox_offers` | FE | Soundbox plan upgrade offer |
| `checkSoundboxHardwareStatus` | FE | Soundbox device health check |
| `raiseServiceRequest` | FC | Raise service ticket; success = `'service request is raised'` |
| `call_me_back` | FE | Schedule callback |
| `trackDeviceForChanges` | FC | Track device status |
| `testBroadCast` | FE | Test soundbox broadcast |
| `showDeviceList` | FE | Show merchant device list |
| `get_settlement_and_payment_information` | FC | Fetch settlement/payment data |
| `agent_handover` | FC | Transfer to human agent |
| `trackSettlementForChanges` | FC | Track settlement changes |
| `plan_upgrade_payment` | FC | Process plan upgrade payment |
| `raiseDeactivationRequest` | FE | Raise deactivation request |
| `update_soundbox_address` | FC | Update soundbox address (old — exclude `_new` variant) |
| `update_soundbox_address_new` | FC | Update soundbox address (new variant) |
| `fetch_specific_payment_details` | FE | Fetch specific transaction details |
| `apply_retention_offer` | FC | Apply retention discount |
| `showEDCDeviceList` | FE | Show card machine device list |
| `parkToOtherTeam` | FE | Route session to another team |
| `call_patch_to_agent` | FE | Live call patch to agent |
| `checkEDCHardwareResposne` | FE | EDC hardware status check |
| `update_profile_address` | FC | Update merchant profile address |
| `parkToSupport` | FC | Route to support queue |
| `View_Tickets` | FE | Show existing DevRev tickets |
| `deactivationRequest` | FE | Deactivation (exclude `raiseDeactivationRequest`) |
| `get_edc_error_code` | FC | Fetch EDC error code |
| `rental_Details` | FE | Show device rental details |

#### Query type for Help Bot (Type 9)

**Trigger phrases:** "function call success rate", "ACPS success", "which functions
are failing", "bot action success", "workflow success rate"

**CTEs needed:** `session_data` (with `id NOT LIKE '2-%'` + `source = 100`) +
`messages_data` + `grouped_sess` + `vertical` (with full plugservice unwrapping) + `final1`

**Key rules:**
- Always use the 6-layer `REGEXP_REPLACE` unwrap pattern on `plugservice_response` before extracting fields
- **MANDATORY (§0.15):** Extract ALL function statuses as named columns in `final1` using `LOWER(JSON_EXTRACT_SCALAR(...))` — never extract inline inside `COUNT`. Doing so returns NULL for every success count.
- The outer SELECT references those pre-extracted column names directly: `AND raiseServiceRequest_status = 'service request is raised'`
- Group by `DATE(created_at)` and `cst_entity`
- Use `LOWER()` on all extracted status values before comparison
- Refer to `master_queries.sql` ("MHD Function Call Success Rate") for the canonical full-query template with all 26 ACPS function columns already defined in `final1`

#### Output format: wide (one row per date/entity) vs. tall (one row per function)

**Type 9A — wide format** (canonical, always safe): all functions as columns in a single SELECT.
Output: 1 row per (date, entity) with 80+ columns. Use this for dashboards or when grouped by date.

**Type 9B — tall format** (one row per function name): better for charts and sortable tables.
Use the `agg` + UNION ALL pattern (§0.18) — NEVER UNION ALL directly from `final1`:

```sql
-- After final1 is defined...
agg AS (
    SELECT
        COUNT(DISTINCT CASE WHEN user_msg >= 1 THEN id END) AS active_sessions,
        -- one attempt + success column per function
        COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%' THEN id END) AS planUpgrade_soundbox_offers_a,
        COUNT(DISTINCT CASE WHEN workflow LIKE '%ACPS_planUpgrade_soundbox_offers%' AND planUpgrade_soundbox_offers_status = 'success' THEN id END) AS planUpgrade_soundbox_offers_s,
        -- repeat for all 26 functions...
    FROM final1   -- final1 referenced ONCE
)
SELECT function_name, attempts, successes,
       ROUND(successes * 100.0 / NULLIF(attempts, 0), 2) AS success_rate_pct,
       active_sessions
FROM (
    SELECT 'planUpgrade_soundbox_offers' AS function_name, planUpgrade_soundbox_offers_a AS attempts, planUpgrade_soundbox_offers_s AS successes, active_sessions FROM agg
    UNION ALL
    -- repeat for each function — cheap column projections from ONE pre-aggregated row
)
ORDER BY attempts DESC
```

Key: `final1` → `agg` (one reference, one pass, one row out) → UNION ALL column projections. This stays within Trino's 200-stage limit.

---

## 9. Open Items / To Be Documented

- [x] `plugservice_response` unwrapping pattern — documented in §14.2 (MHD pattern confirmed)
- [ ] `plugservice_response` unwrapping for CST verticals — may differ from MHD, needs verification
- [ ] `metrics_json` field structure from eval job — full list of keys, value ranges, and meaning
- [ ] Campaign tables (`trino_campaigns.py`) — separate section needed
- [ ] Bounce rate by entity — exact figures for MHD and CST (estimated 35–55%)
- [ ] Full list of system message patterns excluded from `user_msg` count (currently only `'CTA has been shown to the user%'` is known)
- [ ] Best approach for attributing a session to its "primary" entity when the user touched multiple entities (first vs dominant vs last from `vertical_analytics`)
- [ ] Additional metrics to document: resolution rate (from `metrics_json.resolution_achieved`), empathy score, response relevance score, sentiment net change — exact formulas once confirmed
- [ ] MSAT response rate benchmarks by entity

---

## 15. Experimentation Framework — Model & Prompt A/B Testing

### 15.1 Architecture Overview

Paytm's bot backend runs an **experimentation module** that allows multiple prompts and models to run simultaneously in production. This enables A/B testing of LLM performance at the entity + prompt level.

**Session lifecycle:**
1. User opens the bot → **Proactive module** runs first. Entity = `proactiveinitentity` or `p4bwelcomeentity`. This shows CTAs or a welcome message before the user interacts. No model/prompt experiment data is captured here.
2. User clicks a CTA or types a message → **Intent detection** runs on the user's input.
3. The detected intent maps to a `cst_entity`. The backend loads the **prompt** configured for that entity.
4. If an experiment is running for that entity, the **model** is assigned based on experiment config logic — either deterministic (merchant ID / customer ID bucket) or random traffic split. Either model could load for the same entity in the same time window.
5. The bot's assistant response is written to `ticket_session_conversation_snapshot_v3` with `meta.expModel` and `meta.expPrompt` populated.
6. If the user switches topics mid-session, a **different entity** may be detected, causing a different prompt and potentially a different model to load — the same session can accumulate multiple (expModel, expPrompt) combinations across its messages.

**Key implication:** The same session ID can appear under multiple (cst_entity, expModel, expPrompt) combinations if the user's intent changed. Always analyse at `entity + prompt` level, never aggregate totals across prompts for the same session set — you will double-count.

### 15.2 Where expModel and expPrompt Live

Both values are stored per-message in the `meta` JSON column of `ticket_session_conversation_snapshot_v3`:

| Field | JSON path | Description |
|---|---|---|
| `expModel` | `$.expModel` | The model assigned by the experiment config. If absent (no experiment running), falls back to `llm_model` column. Use `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model)` |
| `expPrompt` | `$.expPrompt` | The prompt name loaded for this entity/intent. Absent for proactive/welcome messages. |
| `llmEndPoint` | `$.llmEndPoint` | The LLM endpoint URL used for this message. |
| `intent` | `$.intent` | The detected intent for this message. |

**Only assistant messages (role = `'2'`) carry experiment metadata.** User messages (role = `'1'`) do not.

### 15.3 The `model_base` CTE Pattern

For any query involving experiment analysis, use this pattern to extract (session, model, prompt) combinations:

```sql
messages_data AS (
    SELECT
        ticket_id, message_id, role,
        COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel,
        json_extract_scalar(meta, '$.expPrompt') AS expPrompt,
        json_extract_scalar(meta, '$.llmEndPoint') AS llmEndPoint,
        REGEXP_REPLACE(JSON_EXTRACT_SCALAR(content, '$.content'), '\\.', '') AS content
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    WHERE dl_last_updated >= DATE '...'
    AND ticket_id IN (SELECT DISTINCT id FROM session_data)
),

model_base AS (
    SELECT ticket_id, expModel, expPrompt
    FROM messages_data
    WHERE expModel IS NOT NULL
      AND expPrompt NOT LIKE '%PROACTIVE%'    -- exclude proactive module messages
      AND expPrompt NOT LIKE '%WELCOME%'       -- exclude welcome screen messages
      AND role = '2'                           -- assistant messages only
    GROUP BY 1, 2, 3
)
```

**`model_base` produces one row per (session, expModel, expPrompt).** A session with two prompts produces two rows. When joined to `final1`, the session row is duplicated — this is intentional. The final `GROUP BY (date, entity, model, prompt)` correctly buckets each combination.

**`messages_data` must be defined once and reused** by both `model_base` and `grouped_sess`. Never create a second inline subquery from the conversation table — it doubles the scan cost.

#### ⚠️ CRITICAL — Column completeness when messages_data serves both model_base and grouped_sess

This is the most frequent error in experiment queries. The LLM defines `messages_data` with only the columns `model_base` needs, then `grouped_sess` fails with `COLUMN_NOT_FOUND` on `m.message_id` or `m.content`.

**`messages_data` must always include the full merged column set:**

| Column | Needed by | Why |
|---|---|---|
| `ticket_id` | both | join key |
| `message_id` | `grouped_sess` | `COUNT(DISTINCT message_id)` for user_msg / assis_msg |
| `role` | both | `grouped_sess` user/assis split; `model_base` role = '2' filter |
| `content` (extracted) | `grouped_sess` | CTA exclusion (`NOT LIKE '%CTA has been shown%'`) + function_call_failed check |
| `llm_model` | `model_base` (via COALESCE) | direct column; fallback model identifier for non-experiment sessions. Used inside `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model)`. Omitting this column makes non-experiment sessions disappear from model analysis — they get NULL expModel and are filtered out by `WHERE expModel IS NOT NULL`. |
| `expModel` (`COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model)`) | `model_base` | final model identifier covering both experiment and non-experiment sessions |
| `expPrompt` (`json_extract_scalar(meta, '$.expPrompt')`) | `model_base` | experiment prompt identifier |
| `llmEndPoint` (`json_extract_scalar(meta, '$.llmEndPoint')`) | `model_base` (optional) | endpoint used |

```sql
-- ❌ WRONG (a) — only experiment columns; grouped_sess will fail with COLUMN_NOT_FOUND on m.message_id / m.content
messages_data AS (
    SELECT ticket_id, role,
           COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel,
           json_extract_scalar(meta, '$.expPrompt') AS expPrompt
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    ...
)

-- ❌ WRONG (b) — expModel uses json_extract_scalar alone without COALESCE fallback to llm_model;
--               non-experiment sessions get NULL expModel and vanish from model analysis
messages_data AS (
    SELECT ticket_id, message_id, role,
           json_extract_scalar(meta, '$.expModel') AS expModel,  -- BUG: missing llm_model fallback
           json_extract_scalar(meta, '$.expPrompt') AS expPrompt,
           REGEXP_REPLACE(JSON_EXTRACT_SCALAR(content, '$.content'), '\\.', '') AS content
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    ...
)

-- ✅ CORRECT — full merged set; works for both model_base and grouped_sess
messages_data AS (
    SELECT
        ticket_id,
        message_id,
        role,
        COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model) AS expModel,
        json_extract_scalar(meta, '$.expPrompt') AS expPrompt,
        json_extract_scalar(meta, '$.llmEndPoint') AS llmEndPoint,
        REGEXP_REPLACE(JSON_EXTRACT_SCALAR(content, '$.content'), '\\.', '') AS content
    FROM hive.mhd_crm_cst.ticket_session_conversation_snapshot_v3
    WHERE dl_last_updated >= DATE '...'
    AND ticket_id IN (SELECT DISTINCT id FROM session_data)
)
```

The experiment columns (`expModel`, `expPrompt`) are always **additions** to the base set — they never replace `message_id` or `content`. And `expModel` must always be `COALESCE(json_extract_scalar(meta, '$.expModel'), llm_model)` — never just `json_extract_scalar(meta, '$.expModel')` alone.

### 15.4 Multi-Entity Session Implications

Because a session can touch multiple entities (and thus multiple prompts/models), the experiment output table has this property:

- **SUM of total_sessions across all prompts ≥ actual unique session count.** Sessions that switched prompts are counted once per prompt bucket.
- **Always filter to one (entity, prompt) combination** when comparing metrics between experiments. Never sum total_sessions across rows to get a universe total.
- **cst_entity in the output comes from `session_data` (session-level)**, which is the final entity recorded on the session. For sessions where the user switched entities, this may not match the entity active when a specific prompt loaded. This is a known limitation — for precise message-level entity attribution, `vertical_analytics_data_snapshot_v3` would need to be joined.

### 15.5 Weighted Average Rule — Always Output SUM + COUNT Alongside AVG

When this query is grouped by (entity, model, prompt) and you later want to compute a combined average across multiple groups (e.g. "what is the overall avg_eval_score for this model across all entities?"), a simple `AVG(avg_eval_score)` is wrong — it treats groups with 2 sessions the same as groups with 2000 sessions.

**Rule: every AVG metric in an experiment query must be accompanied by a `_sum` and a `_count` column.** Use `_sum / _count` to compute correct weighted averages post-query.

| Metric | AVG column | SUM column | COUNT column |
|---|---|---|---|
| Eval score | `avg_eval_score` | `eval_score_sum` | `eval_session_count` |
| Response relevance | `avg_response_relevance_score` | `response_relevance_score_sum` | `response_relevance_score_count` |
| Empathy score | `avg_empathy_score` | `empathy_score_sum` | `empathy_score_count` |
| Topic drift | `avg_topic_drift` | `topic_drift_sum` | `topic_drift_count` |
| Sentiment change | `avg_sentiment_change` | `sentiment_change_sum` | `sentiment_change_count` |
| Resolution achieved | `avg_resolution_achieved` | `resolution_achieved_sum` | `resolution_achieved_count` |

This applies to any query that aggregates eval metrics at a sub-session granularity (entity, prompt, model, date). The master query in `master_queries.sql` (§4) already implements this pattern — follow it exactly.

### 15.6 Proactive/Welcome Entity Exclusion

The `session_data` CTE for experiment queries **must exclude** proactive and welcome entities:

```sql
AND cst_entity NOT IN ('proactiveinitentity', 'p4bwelcomeentity')
```

These entities represent the pre-intent phase of a session — before the user has interacted and before any real prompt was loaded. Including them inflates session counts and pollutes entity-level experiment metrics.

### 15.7 Query Routing for Experiment Questions

| User asks about | CTEs to include |
|---|---|
| Which model/prompt is running for an entity | `session_data` + `messages_data` + `model_base` |
| Eval metrics by model or prompt | Full experiment query pattern (§master query 4) |
| Comparing two prompts/models | Filter final output to specific (entity, expPrompt) or (entity, expModel) values |
| Session count for an experiment | `total_sessions` column — but remember multi-entity inflation rule (§15.4) |
| Weighted avg across experiment groups | Use `_sum / _count` columns, not `AVG(avg_...)` |
