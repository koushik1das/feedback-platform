/**
 * App.js – Root application component.
 *
 * Channels:
 *   app_store → Google Play MCP (TODO: wire MCP when available)
 *   helpdesk  → Trino via /api/helpdesk/analyse
 */

import React, { useState, useCallback } from 'react';
import axios from 'axios';

import ChannelSelector from './components/ChannelSelector';
import TopIssues        from './components/TopIssues';
import EscalationStats  from './components/EscalationStats';
import IssueList        from './components/IssueList';
import FeedbackTable   from './components/FeedbackTable';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

export default function App() {
  const [selectedChannel,  setSelectedChannel]  = useState(null);
  const [helpdeskType,     setHelpdeskType]     = useState(null);  // 'merchant' | 'customer'
  const [helpdeskProduct,  setHelpdeskProduct]  = useState(null);
  const [insights,         setInsights]         = useState(null);
  const [rawFeedback,      setRawFeedback]      = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);

  const handleSelectChannel = useCallback((id) => {
    setSelectedChannel(id);
    setHelpdeskType(null);
    setHelpdeskProduct(null);
    setInsights(null);
    setRawFeedback([]);
    setError(null);
  }, []);

  const handleSelectHelpdeskType = useCallback((type) => {
    setHelpdeskType(type);
    setHelpdeskProduct(null);
    setInsights(null);
    setRawFeedback([]);
    setError(null);
  }, []);

  const handleSelectProduct = useCallback((product) => {
    setHelpdeskProduct(product);
    setInsights(null);
    setRawFeedback([]);
    setError(null);
  }, []);

  const handleAnalyse = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInsights(null);
    setRawFeedback([]);

    try {
      if (selectedChannel === 'helpdesk') {
        // ── Helpdesk → Trino ──────────────────────────────────────────────
        const res = await axios.post(`${API_BASE}/helpdesk/analyse`, {
          helpdesk_type: helpdeskType,
          product:       helpdeskProduct,
        });
        setInsights(res.data);

      } else if (selectedChannel === 'app_store') {
        // ── App Store → Google Play MCP (TODO) ───────────────────────────
        // Placeholder: falls back to mock analyse endpoint until MCP is wired
        const [insightsRes, feedbackRes] = await Promise.all([
          axios.post(`${API_BASE}/analyse`, { channels: ['app_store'] }),
          axios.get(`${API_BASE}/feedback`, {
            params: { channels: ['app_store'], limit: 200 },
            paramsSerializer: { indexes: null },
          }),
        ]);
        setInsights(insightsRes.data);
        setRawFeedback(feedbackRes.data);
      }
    } catch (e) {
      setError(
        e.response?.data?.detail ||
        'Analysis failed. Please check the backend server.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedChannel, helpdeskType, helpdeskProduct]);

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
          selectedChannel={selectedChannel}
          helpdeskType={helpdeskType}
          helpdeskProduct={helpdeskProduct}
          onSelectChannel={handleSelectChannel}
          onSelectHelpdeskType={handleSelectHelpdeskType}
          onSelectProduct={handleSelectProduct}
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
                <div className="stat-label">Sessions</div>
                <div className="stat-value stat-primary">{insights.total_feedback.toLocaleString()}</div>
                <div className="stat-sub">{insights.channels_analysed.join(', ')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Social Media Threat</div>
                <div className="stat-value stat-negative">
                  {(insights.social_media_threat_pct ?? 0).toFixed(2)}%
                </div>
                <div className="stat-sub">{(insights.social_media_threat_count ?? 0).toLocaleString()} threat mentions</div>
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

            {/* Issue list */}
            <IssueList issues={insights.top_issues} helpdeskType={helpdeskType} />

            {/* Raw feed table — only shown for App Store (Helpdesk uses Trino, no raw items) */}
            {rawFeedback.length > 0 && <FeedbackTable items={rawFeedback} />}
          </>
        )}

        {/* ── Idle empty state ── */}
        {!insights && !loading && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <h3>Select a channel above and click Analyse</h3>
            <p>The platform will aggregate feedback, detect issues, and present AI-powered insights.</p>
          </div>
        )}
      </main>
    </div>
  );
}
