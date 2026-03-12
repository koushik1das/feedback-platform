/**
 * App.js – Root application component.
 *
 * State machine:
 *   idle      → user selects channels
 *   loading   → API call in progress
 *   results   → insights displayed
 *   error     → API call failed
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

import ChannelSelector from './components/ChannelSelector';
import TopIssues       from './components/TopIssues';
import SentimentChart  from './components/SentimentChart';
import IssueCards      from './components/IssueCards';
import FeedbackTable   from './components/FeedbackTable';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

export default function App() {
  const [channels,    setChannels]    = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [insights,    setInsights]    = useState(null);
  const [rawFeedback, setRawFeedback] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // Fetch channel metadata on mount
  useEffect(() => {
    axios.get(`${API_BASE}/channels`)
      .then((r) => setChannels(r.data))
      .catch(() => setError('Could not connect to the backend. Is the server running on port 8000?'));
  }, []);

  const toggleChannel = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Clear results when channel selection changes
    setInsights(null);
    setRawFeedback([]);
    setError(null);
  }, []);

  const handleAnalyse = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);
    setInsights(null);
    setRawFeedback([]);

    try {
      const [insightsRes, feedbackRes] = await Promise.all([
        axios.post(`${API_BASE}/analyse`, { channels: Array.from(selectedIds) }),
        axios.get(`${API_BASE}/feedback`, {
          params: { channels: Array.from(selectedIds), limit: 200 },
          // axios serialises array params differently; use paramsSerializer
          paramsSerializer: { indexes: null },
        }),
      ]);
      setInsights(insightsRes.data);
      setRawFeedback(feedbackRes.data);
    } catch (e) {
      setError(
        e.response?.data?.detail ||
        'Analysis failed. Please check the backend server.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  return (
    <div className="app-wrapper">
      {/* ── Top bar ── */}
      <header className="topbar">
        <a className="topbar-brand" href="/">
          <div className="topbar-brand-icon">💡</div>
          <div>
            <div>FeedbackIQ</div>
            <div className="topbar-subtitle">Customer Intelligence Platform</div>
          </div>
        </a>
        {insights && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#64748b' }}>
            <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
            Last analysed: {new Date(insights.generated_at).toLocaleTimeString()}
          </div>
        )}
      </header>

      <main className="main-content">
        {/* ── Error banner ── */}
        {error && (
          <div className="error-banner">
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Channel selector ── */}
        <ChannelSelector
          channels={channels}
          selectedIds={selectedIds}
          onToggle={toggleChannel}
          onAnalyse={handleAnalyse}
          loading={loading}
        />

        {/* ── Loading skeleton ── */}
        {loading && (
          <div>
            <div className="stats-row">
              {[1,2,3,4].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
            <div className="dashboard-grid">
              <div className="skeleton skeleton-card" style={{ height: 420 }} />
              <div className="skeleton skeleton-card" style={{ height: 420 }} />
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {insights && !loading && (
          <>
            {/* Summary stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Total Feedback</div>
                <div className="stat-value stat-primary">{insights.total_feedback}</div>
                <div className="stat-sub">{insights.channels_analysed.join(', ')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Top Issue</div>
                <div className="stat-value" style={{ fontSize: '1.1rem', lineHeight: 1.3, marginTop: '.25rem' }}>
                  {insights.top_issues[0]?.label || '—'}
                </div>
                <div className="stat-sub">{insights.top_issues[0]?.percentage}% of complaints</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Negative Sentiment</div>
                <div className="stat-value stat-negative">
                  {insights.sentiment_distribution.total > 0
                    ? Math.round(insights.sentiment_distribution.negative / insights.sentiment_distribution.total * 100)
                    : 0}%
                </div>
                <div className="stat-sub">{insights.sentiment_distribution.negative} unhappy customers</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Issue Categories</div>
                <div className="stat-value stat-primary">{insights.top_issues.length}</div>
                <div className="stat-sub">distinct complaint clusters</div>
              </div>
            </div>

            {/* AI Summary */}
            {insights.ai_summary && (
              <div className="ai-banner">
                <div className="ai-banner-icon">🤖</div>
                <div>
                  <div className="ai-banner-label">AI Executive Summary</div>
                  <div className="ai-banner-text">{insights.ai_summary}</div>
                </div>
              </div>
            )}

            {/* Trending issues */}
            {insights.trending_issues?.length > 0 && (
              <div className="trending-section">
                <h3>🔥 Trending Issues</h3>
                <div className="trending-list">
                  {insights.trending_issues.map((t) => (
                    <span className="trending-pill" key={t}>🔥 {t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Charts row */}
            <div className="dashboard-grid">
              <TopIssues issues={insights.top_issues} />
              <SentimentChart distribution={insights.sentiment_distribution} />
            </div>

            {/* Issue detail cards */}
            <IssueCards issues={insights.top_issues} />

            {/* Raw feed table */}
            <FeedbackTable items={rawFeedback} />
          </>
        )}

        {/* ── Idle empty state ── */}
        {!insights && !loading && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <h3>Select channels above and click Analyse</h3>
            <p>The platform will aggregate feedback, detect issues, and present AI-powered insights.</p>
          </div>
        )}
      </main>
    </div>
  );
}
