/**
 * App.js – Root application component.
 *
 * Channels:
 *   app_store → Google Play MCP (TODO: wire MCP when available)
 *   helpdesk  → Trino via /api/helpdesk/analyse
 */

import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

import ChannelSelector    from './components/ChannelSelector';
import TopIssues          from './components/TopIssues';
import EscalationStats    from './components/EscalationStats';
import IssueList          from './components/IssueList';
import FeedbackTable      from './components/FeedbackTable';
import CampaignDashboard  from './components/CampaignDashboard';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const APP_LABELS = {
  'net.one97.paytm':    'Paytm',
  'com.paytm.business': 'Paytm for Business',
  'com.phonepe.app':    'PhonePe',
};

export default function App() {
  const [selectedChannel,  setSelectedChannel]  = useState(null);
  const [appStoreApp,      setAppStoreApp]      = useState(null);
  const [helpdeskType,     setHelpdeskType]     = useState(null);
  const [helpdeskCategory, setHelpdeskCategory] = useState(null);
  const [helpdeskProduct,  setHelpdeskProduct]  = useState(null);
  const [dateRange,        setDateRange]        = useState('last_7_days');
  const [insights,         setInsights]         = useState(null);
  const [rawFeedback,      setRawFeedback]      = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [loadingMore,      setLoadingMore]      = useState(false);
  const [error,            setError]            = useState(null);
  const [sessionId,        setSessionId]        = useState(null);
  const [hasMore,          setHasMore]          = useState(false);
  const [totalLoaded,      setTotalLoaded]      = useState(0);
  const [campaignList,     setCampaignList]     = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignDetail,   setCampaignDetail]   = useState(null);

  const handleSelectChannel = useCallback((id) => {
    setSelectedChannel(id);
    setAppStoreApp(null);
    setHelpdeskType(null);
    setHelpdeskCategory(null);
    setHelpdeskProduct(null);
    setInsights(null);
    setRawFeedback([]);
    setError(null);
    setSessionId(null);
    setHasMore(false);
    setTotalLoaded(0);
    setSelectedCampaign(null);
    setCampaignDetail(null);
  }, []);

  const handleSelectHelpdeskType = useCallback((type) => {
    setHelpdeskType(type);
    setHelpdeskCategory(null);
    setHelpdeskProduct(null);
    setInsights(null);
    setRawFeedback([]);
    setError(null);
  }, []);

  const handleSelectHelpdeskCategory = useCallback((category) => {
    setHelpdeskCategory(category);
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

  // Fetch campaign list whenever campaigns channel is active or date range changes
  useEffect(() => {
    if (selectedChannel !== 'campaigns') return;
    setCampaignsLoading(true);
    setCampaignList([]);
    setSelectedCampaign(null);
    setCampaignDetail(null);
    axios.get(`${API_BASE}/campaigns?date_range=${dateRange}`)
      .then(res => setCampaignList(res.data))
      .catch(() => setCampaignList([]))
      .finally(() => setCampaignsLoading(false));
  }, [selectedChannel, dateRange]);

  const handleAnalyse = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInsights(null);
    setRawFeedback([]);

    try {
      if (selectedChannel === 'campaigns') {
        const res = await axios.get(
          `${API_BASE}/campaigns/analyse?campaign=${encodeURIComponent(selectedCampaign)}&date_range=${dateRange}`
        );
        setCampaignDetail(res.data);
        return;
      } else if (selectedChannel === 'helpdesk') {
        // ── Helpdesk → Trino ──────────────────────────────────────────────
        const res = await axios.post(`${API_BASE}/helpdesk/analyse`, {
          helpdesk_type: helpdeskType,
          product:       helpdeskProduct,
          date_range:    dateRange,
        });
        setInsights(res.data);
        // Build raw rows from example comments across all issue clusters
        const rows = [];
        (res.data.top_issues || []).forEach((iss) => {
          (iss.example_comments || []).forEach((text, i) => {
            rows.push({
              id:            `${iss.label}-${i}`,
              source:        'helpdesk_zendesk',
              channel:       'helpdesk',
              timestamp:     new Date().toISOString(),
              customer_text: text,
              rating:        null,
              issue_label:   iss.label,
            });
          });
        });
        setRawFeedback(rows);

      } else if (selectedChannel === 'app_store') {
        const res = await axios.post(`${API_BASE}/analyse`, {
          channels:    ['app_store'],
          app_package: appStoreApp || undefined,
        });
        setInsights(res.data);
        setSessionId(res.data.session_id || null);
        setHasMore(res.data.has_more || false);
        setTotalLoaded(res.data.total_reviews_loaded || 0);
        // Fetch raw reviews for the table
        const rawRes = await axios.get(`${API_BASE}/feedback?channels=app_store&limit=500`);
        setRawFeedback(rawRes.data);
      }
    } catch (e) {
      setError(
        e.response?.data?.detail ||
        'Analysis failed. Please check the backend server.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedChannel, appStoreApp, helpdeskType, helpdeskProduct, dateRange, selectedCampaign]);

  const handleLoadMore = useCallback(async () => {
    if (!sessionId) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await axios.post(
        `${API_BASE}/app-store/load-more?session_id=${sessionId}&count=200`
      );
      setInsights(res.data);
      setHasMore(res.data.has_more || false);
      setTotalLoaded(res.data.total_reviews_loaded || 0);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load more reviews.');
    } finally {
      setLoadingMore(false);
    }
  }, [sessionId]);

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
          appStoreApp={appStoreApp}
          helpdeskType={helpdeskType}
          helpdeskCategory={helpdeskCategory}
          helpdeskProduct={helpdeskProduct}
          dateRange={dateRange}
          campaigns={campaignList}
          campaignsLoading={campaignsLoading}
          selectedCampaign={selectedCampaign}
          onSelectChannel={handleSelectChannel}
          onSelectAppStoreApp={(id) => {
            setAppStoreApp(id);
            setInsights(null);
            setRawFeedback([]);
            setError(null);
          }}
          onSelectHelpdeskType={handleSelectHelpdeskType}
          onSelectHelpdeskCategory={handleSelectHelpdeskCategory}
          onSelectProduct={handleSelectProduct}
          onSelectDateRange={setDateRange}
          onSelectCampaign={(name) => {
            setSelectedCampaign(name);
            setCampaignDetail(null);
          }}
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

        {/* ── Campaigns view ── */}
        {selectedChannel === 'campaigns' && !loading && campaignDetail && (
          <CampaignDashboard detail={campaignDetail} />
        )}

        {/* ── Results ── */}
        {insights && !loading && selectedChannel !== 'campaigns' && (
          <>
            {/* Summary stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label"># of Feedbacks</div>
                <div className="stat-value stat-primary">{insights.total_feedback.toLocaleString()}</div>
                <div className="stat-sub">
                  {appStoreApp ? APP_LABELS[appStoreApp] || appStoreApp : insights.channels_analysed.join(', ')}
                </div>
              </div>
              {insights.avg_rating != null && (
                <div className="stat-card">
                  <div className="stat-label">Overall App Rating</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', margin: '.25rem 0' }}>
                    <span style={{ fontSize: '1.25rem', letterSpacing: '1px', color: insights.avg_rating >= 4 ? '#10b981' : insights.avg_rating >= 3 ? '#f59e0b' : '#ef4444' }}>
                      {'★'.repeat(Math.round(insights.avg_rating))}{'☆'.repeat(5 - Math.round(insights.avg_rating))}
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: insights.avg_rating >= 4 ? '#10b981' : insights.avg_rating >= 3 ? '#f59e0b' : '#ef4444' }}>
                      {insights.avg_rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="stat-sub">out of 5 stars</div>
                </div>
              )}
            </div>


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


            {/* Raw feed table */}
            {rawFeedback.length > 0 && <FeedbackTable items={rawFeedback} />}
          </>
        )}

        {/* ── Idle empty state ── */}
        {selectedChannel === 'campaigns' && !loading && !campaignDetail && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">📞</div>
            <h3>Select a campaign above and click Analyse</h3>
            <p>View call statistics, duration breakdown, daily trends, and individual session recordings.</p>
          </div>
        )}

        {!insights && !campaignDetail && !loading && !error && selectedChannel !== 'campaigns' && (
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
