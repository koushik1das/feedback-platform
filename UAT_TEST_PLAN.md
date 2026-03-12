# UAT Test Plan — Customer Feedback Intelligence Platform

**Version:** 1.0
**Date:** March 2026
**Prepared by:** QA / Product Team
**Application:** FeedbackIQ — Customer Feedback Intelligence Platform

---

## 1. Scope

This UAT plan covers end-to-end user acceptance testing of the FeedbackIQ dashboard.
Testing validates that all user-facing flows work correctly from a business perspective,
independent of internal implementation.

---

## 2. Test Environment Setup

| Item            | Value                                         |
|-----------------|-----------------------------------------------|
| Backend URL     | `http://localhost:8000`                       |
| Frontend URL    | `http://localhost:3000`                       |
| Browsers        | Chrome 120+, Firefox 120+, Safari 17+        |
| Devices         | Desktop (1440px), Tablet (768px)              |
| Test data       | Simulated mock data (no real API keys needed) |

---

## 3. UAT Test Cases

---

### TC-001 — Page Load and Initial State

**Priority:** Critical
**Actor:** Any user

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `http://localhost:3000` | Page loads without errors |
| 2 | Observe header | "FeedbackIQ" logo and subtitle visible |
| 3 | Observe channel grid | 5 channel cards visible: App Store, Social Media, Help Desk, Email, Chatbot |
| 4 | Observe Analyse button | Button visible but disabled (no channel selected) |
| 5 | Observe main area | "Select channels above and click Analyse" empty state shown |

**Pass Criteria:** All 5 elements render correctly within 3 seconds.

---

### TC-002 — Single Channel Selection (App Store)

**Priority:** Critical
**Actor:** Product Manager

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the "App Store" channel card | Card highlights with indigo border |
| 2 | Observe check mark | Tick mark (✓) appears on card icon |
| 3 | Observe Analyse button | Button becomes enabled: "Analyse (1 channel)" |
| 4 | Click Analyse button | Loading spinner shown in button |
| 5 | Wait for results | Dashboard populates with data |
| 6 | Observe "Total Feedback" stat | Shows count matching App Store item count (≥30) |
| 7 | Observe Top Issues section | Bar chart and ranked list visible |
| 8 | Observe Sentiment Distribution | Donut chart visible with Positive/Neutral/Negative |

**Pass Criteria:** Results load within 5 seconds and all sections populate.

---

### TC-003 — Multiple Channel Selection

**Priority:** Critical
**Actor:** Customer Success Manager

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "App Store" | Card highlights |
| 2 | Select "Social Media" | Second card also highlights |
| 3 | Select "Help Desk" | Third card also highlights |
| 4 | Observe button | Shows "Analyse (3 channels)" |
| 5 | Click Analyse | API call made with all 3 channels |
| 6 | Observe total count | Higher than single-channel count |

**Pass Criteria:** Feedback count equals sum of individual channel counts.

---

### TC-004 — All Channels Combined Analysis

**Priority:** High
**Actor:** Head of Customer Experience

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click each channel card (all 5) | All cards show highlighted state |
| 2 | Click Analyse | Loading state shown |
| 3 | Observe Total Feedback | Highest count across all test cases |
| 4 | Observe AI Summary banner | Purple gradient banner with executive summary text |
| 5 | Observe Top Issues bar chart | At least 5 bars visible |
| 6 | Observe Issue Detail cards | Multiple expandable cards shown |

**Pass Criteria:** All 5 channels reflected, AI summary is coherent text.

---

### TC-005 — Top Issues Accuracy

**Priority:** High
**Actor:** Data Analyst

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse "App Store" + "Help Desk" | Results load |
| 2 | Observe top issue (rank #1) | "Payment & Billing Issues" (highest frequency) |
| 3 | Observe percentages | All percentages sum to ~100% |
| 4 | Observe bar chart | Bars are proportional to percentages |
| 5 | Verify ranking | Issues sorted from highest to lowest |

**Pass Criteria:** Payment issues rank #1; percentages sum to 100% ± 1%.

---

### TC-006 — Sentiment Analysis Display

**Priority:** High
**Actor:** CX Analyst

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse any channel | Results load |
| 2 | Observe Sentiment Distribution card | Donut chart with 3 segments |
| 3 | Check colour coding | Positive=green, Neutral=amber, Negative=red |
| 4 | Check legend | Shows count and percentage for each sentiment |
| 5 | Check "Overall Sentiment" label | Shows dominant sentiment label |
| 6 | Verify total | Positive + Neutral + Negative = Total Feedback |

**Pass Criteria:** Colours correct, numbers consistent, total accurate.

---

### TC-007 — Issue Detail Cards Expand/Collapse

**Priority:** Medium
**Actor:** Support Team Lead

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse "Help Desk" channel | Issue cards appear below charts |
| 2 | Click an issue card header | Card expands showing details |
| 3 | Observe expanded card | Shows: avg sentiment score, channel breakdown, channel pills |
| 4 | Observe "Customer Voices" section | 1–3 real customer quotes shown in italics |
| 5 | Click header again | Card collapses |
| 6 | Click a different card | That card expands, previous stays collapsed |

**Pass Criteria:** Cards expand/collapse correctly, customer quotes are real text.

---

### TC-008 — Raw Feedback Table

**Priority:** Medium
**Actor:** Support Analyst

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse any channel | Raw Feedback table appears at bottom |
| 2 | Observe columns | Source, Channel, Date, Customer Feedback, Rating columns present |
| 3 | Observe source chips | Show source icon + name (e.g. "🍎 app store ios") |
| 4 | Observe channel badges | Colour-coded by channel type |
| 5 | Check pagination | "Page 1 of N" shown; Next button active if >10 items |
| 6 | Click "Next →" | Next page of items shown, different records |
| 7 | Click "← Prev" | Returns to previous page |
| 8 | Observe total count | Matches "Total Feedback" stat card |

**Pass Criteria:** Table paginates correctly with no duplicate rows.

---

### TC-009 — Trending Issues Display

**Priority:** Medium
**Actor:** Product Manager

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse multiple channels | Results load |
| 2 | Observe trending section | "🔥 Trending Issues" heading visible |
| 3 | Observe pills | Orange pills with "🔥" prefix and issue name |
| 4 | Verify content | Trending issues are high-volume, negative-sentiment categories |

**Pass Criteria:** At least 1 trending issue shown when analysing 2+ channels.

---

### TC-010 — Channel Deselection and Re-analysis

**Priority:** Medium
**Actor:** Any user

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "App Store" and Analyse | Results shown |
| 2 | Click "App Store" card again | Card deselects (highlight removed) |
| 3 | Observe dashboard | Previous results cleared |
| 4 | Observe Analyse button | Disabled again (0 channels selected) |
| 5 | Select "Chatbot" | Button enables |
| 6 | Click Analyse | Fresh results for Chatbot only |
| 7 | Verify total count | Lower than All-channels count |

**Pass Criteria:** Re-analysis clears old results and shows fresh data.

---

### TC-011 — API Summary Banner Readability

**Priority:** Low
**Actor:** Executive Stakeholder

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Analyse all channels | AI summary banner visible |
| 2 | Read summary text | 2–3 sentences, mentions top issue names |
| 3 | Verify it is factual | Numbers and channel names match the dashboard data |
| 4 | Verify no jargon | Readable by non-technical users |

**Pass Criteria:** Summary is coherent, factual, and references top issues.

---

### TC-012 — Responsive Layout (Tablet)

**Priority:** Low
**Actor:** Mobile Product Manager

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open dashboard at 768px width | Page renders without horizontal scroll |
| 2 | Observe channel grid | Cards stack to 2 columns |
| 3 | Observe dashboard charts | Top Issues and Sentiment stack vertically |
| 4 | Observe Issue Cards | Stack to 1 column |
| 5 | Check table | Scrolls horizontally if needed |

**Pass Criteria:** All content visible and usable without overflow.

---

### TC-013 — Error Handling (Backend Down)

**Priority:** High
**Actor:** Support Engineer

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop the backend server | Backend not running |
| 2 | Refresh the dashboard | Error banner appears at top |
| 3 | Read error message | "Could not connect to the backend…" shown |
| 4 | Restart the backend | Refresh page — channel cards load again |

**Pass Criteria:** Clear error message, no JS crash, recoverable.

---

### TC-014 — Performance Test

**Priority:** Medium
**Actor:** Performance Tester

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select all 5 channels | All selected |
| 2 | Click Analyse and start timer | |
| 3 | Wait for results to fully load | |
| 4 | Stop timer | Total time < 5 seconds |
| 5 | Repeat 3 times | Consistent <5 second response |

**Pass Criteria:** P95 analysis latency < 5 seconds for all channels combined.

---

## 4. UAT Sign-off Checklist

| Test Case | Tester | Status | Notes |
|-----------|--------|--------|-------|
| TC-001    |        |        |       |
| TC-002    |        |        |       |
| TC-003    |        |        |       |
| TC-004    |        |        |       |
| TC-005    |        |        |       |
| TC-006    |        |        |       |
| TC-007    |        |        |       |
| TC-008    |        |        |       |
| TC-009    |        |        |       |
| TC-010    |        |        |       |
| TC-011    |        |        |       |
| TC-012    |        |        |       |
| TC-013    |        |        |       |
| TC-014    |        |        |       |

**Overall UAT Status:** [ ] Pass  [ ] Fail  [ ] Conditional Pass
**Sign-off Date:**
**Signed by:**
