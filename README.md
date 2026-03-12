# FeedbackIQ — Customer Feedback Intelligence Platform

A full-stack prototype that aggregates customer feedback from multiple channels,
runs NLP analysis, and surfaces top pain points in a clean React dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DASHBOARD UI (React)                      │
│  ChannelSelector → TopIssues Chart → SentimentChart → IssueCards│
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP (REST API)
┌───────────────────────────▼─────────────────────────────────────┐
│                      API LAYER (FastAPI)                         │
│  GET /api/channels   POST /api/analyse   GET /api/feedback       │
└──────────┬──────────────────────────────────────┬───────────────┘
           │                                      │
┌──────────▼──────────────┐          ┌────────────▼───────────────┐
│   INGESTION LAYER       │          │    NLP ANALYSIS LAYER       │
│  sources.py             │          │  sentiment.py               │
│  aggregator.py          │          │  clustering.py (TF-IDF+KM)  │
│                         │          │  insights.py                │
│  Channels:              │          │                             │
│  • App Store (iOS+Play) │          │  • Keyword categorisation   │
│  • Social Media (TW/FB) │          │  • TF-IDF fallback          │
│  • Help Desk (Zendesk)  │          │  • Sentiment scoring        │
│  • Email                │          │  • Claude API summary       │
│  • Chatbot logs         │          │    (optional, falls back)   │
└──────────┬──────────────┘          └────────────────────────────┘
           │
┌──────────▼──────────────┐
│   DATA STORE            │
│  In-memory (prototype)  │
│  → swap for PostgreSQL  │
└─────────────────────────┘
```

### Data Flow

1. User selects channels on the dashboard and clicks **Analyse**
2. Frontend `POST /api/analyse` with channel list
3. API calls `aggregate_feedback()` → fetches mock data per channel
4. `categorise_feedback()` runs keyword + TF-IDF clustering + sentiment
5. `generate_insights()` builds `InsightsResponse` with stats, examples, summary
6. JSON response rendered as charts, cards, and table in the UI

---

## Technology Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend API | Python + FastAPI | Fast async REST, auto-docs via OpenAPI |
| Data models | Pydantic v2 | Type-safe validation, serialisation |
| NLP / Clustering | scikit-learn (TF-IDF + KMeans) | No GPU required, deterministic |
| Sentiment | Lexicon-based (custom) | Zero dependencies, fast, explainable |
| AI Summary | Claude API (`claude-sonnet-4-6`) | Optional; deterministic fallback included |
| Frontend | React 18 | Widely adopted, component-based |
| Charts | Recharts | React-native, responsive |
| Storage | In-memory (prototype) | Swap for PostgreSQL/SQLite in production |
| Testing | pytest + FastAPI TestClient | 88 tests, 100% pass rate |

---

## Project Structure

```
feedback-platform/
├── backend/
│   ├── models.py              # Pydantic data models
│   ├── ingestion/
│   │   ├── sources.py         # Mock data for all 5 channels
│   │   └── aggregator.py      # Multi-channel aggregation
│   ├── analysis/
│   │   ├── sentiment.py       # Lexicon-based sentiment scoring
│   │   ├── clustering.py      # Keyword + TF-IDF issue categorisation
│   │   └── insights.py        # Stats, summaries, trending detection
│   ├── api/
│   │   ├── main.py            # FastAPI app + CORS
│   │   └── routes.py          # REST endpoints
│   └── requirements.txt
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── App.js             # Root component + state machine
│       ├── components/
│       │   ├── ChannelSelector.js
│       │   ├── TopIssues.js   # Bar chart + ranked list
│       │   ├── SentimentChart.js
│       │   ├── IssueCards.js  # Expandable detail cards
│       │   └── FeedbackTable.js
│       └── styles/App.css
├── tests/
│   ├── test_ingestion.py      # 30 ingestion tests
│   ├── test_analysis.py       # 31 NLP tests
│   └── test_api.py            # 27 API integration tests
├── UAT_TEST_PLAN.md           # 14 UAT scenarios
└── README.md
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+

### 1. Run the Backend

```bash
cd feedback-platform/backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Backend is available at:
- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 2. Run the Frontend

In a new terminal:

```bash
cd feedback-platform/frontend
npm install
npm start
```

Dashboard opens at `http://localhost:3000`

### 3. (Optional) Enable AI Summaries via Claude

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# Then restart the backend
uvicorn api.main:app --reload --port 8000
```

Without the key, a deterministic fallback summary is generated automatically.

---

## Run Tests

```bash
cd feedback-platform/backend
source venv/bin/activate
pytest ../tests/ -v
```

Expected output: **88 passed**

---

## Extending to Real APIs

Each `fetch_*` function in `backend/ingestion/sources.py` is the only
file you need to modify to connect to real data:

| Channel | Replace with |
|---------|-------------|
| App Store iOS | Apple App Store Connect API |
| Google Play | Google Play Developer API |
| Twitter/X | Twitter API v2 (Tweets search) |
| Facebook | Facebook Graph API |
| Help Desk | Zendesk / Freshdesk REST API |
| Email | Gmail API / IMAP / Mailgun webhooks |
| Chatbot | Platform-specific export (Dialogflow, Intercom, etc.) |

The `FeedbackItem` schema and all downstream analysis remain unchanged.
