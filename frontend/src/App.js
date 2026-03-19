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
import Login              from './components/Login';
import TranscriptModal    from './components/TranscriptModal';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const APP_LABELS = {
  'net.one97.paytm':    'Paytm',
  'com.paytm.business': 'Paytm for Business',
  'com.phonepe.app':    'PhonePe',
};

// ── Data date banner ─────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' }); }
  catch { return d; }
}

function DataDateBanner({ from, until }) {
  const same = from === until;
  const today = new Date();
  const untilDate = new Date(until);
  const daysStale = Math.floor((today - untilDate) / (1000 * 60 * 60 * 24));
  const isStale = daysStale > 2;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.6rem',
      padding: '.55rem 1.25rem',
      background: isStale ? '#fef2f2' : '#fffbeb',
      borderBottom: `1px solid ${isStale ? '#fecaca' : '#fde68a'}`,
      fontSize: '.78rem',
      color: isStale ? '#b91c1c' : '#92400e',
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{isStale ? '🔴' : '⚠️'}</span>
      <span>
        <strong>Data range: {same ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(until)}`}</strong>
        {isStale && (
          <span style={{ marginLeft: '.5rem', fontWeight: 400 }}>
            · Pipeline is <strong>{daysStale} days behind</strong> — latest available data is from {fmtDate(until)}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function _getStoredToken() {
  try { return localStorage.getItem('fiq_token'); } catch { return null; }
}
function _storeToken(t) {
  try { localStorage.setItem('fiq_token', t); } catch {}
}
function _clearToken() {
  try { localStorage.removeItem('fiq_token'); } catch {}
}

export default function App() {
  const [authToken,        setAuthToken]        = useState(() => _getStoredToken());
  const [authUser,         setAuthUser]         = useState(null);
  const [authError,        setAuthError]        = useState(null);
  const [authLoading,      setAuthLoading]      = useState(true); // always true until resolved
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
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignDetail,   setCampaignDetail]   = useState(null);
  const [selectedIvrCategory,      setSelectedIvrCategory]      = useState(null);
  const [ivrInsights,              setIvrInsights]              = useState(null);
  const [selectedSoundboxCategory, setSelectedSoundboxCategory] = useState(null);
  const [soundboxInsights,         setSoundboxInsights]         = useState(null);
  const [globalSearch,             setGlobalSearch]             = useState('');
  const [globalTranscriptId,       setGlobalTranscriptId]       = useState(null);

  // ── On mount: handle Google OAuth code or validate stored token ─────────────
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code     = params.get('code');
    const urlError = params.get('auth_error');

    if (urlError) {
      setAuthError(urlError);
      setAuthLoading(false);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (code) {
      // Google just redirected here with ?code= — exchange it for a JWT
      window.history.replaceState({}, '', window.location.pathname);
      axios.get(`${API_BASE}/auth/exchange?code=${encodeURIComponent(code)}`)
        .then(res => {
          const { token, email, name, picture } = res.data;
          _storeToken(token);
          setAuthToken(token);
          setAuthUser({ email, name, picture });
        })
        .catch(err => {
          const detail = err.response?.data?.detail || 'login_failed';
          setAuthError(detail);
        })
        .finally(() => setAuthLoading(false));
      return;
    }

    // No code in URL — validate stored token
    const token = authToken;
    if (!token) { setAuthLoading(false); return; }

    axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setAuthUser(res.data))
      .catch(() => {
        _clearToken();
        setAuthToken(null);
        setAuthUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []); // eslint-disable-line

  // ── Inject auth header into every axios request automatically ────────────────
  useEffect(() => {
    const id = axios.interceptors.request.use(cfg => {
      if (authToken) cfg.headers = { ...cfg.headers, Authorization: `Bearer ${authToken}` };
      return cfg;
    });
    return () => axios.interceptors.request.eject(id);
  }, [authToken]);

  const handleSignOut = useCallback(() => {
    _clearToken();
    setAuthToken(null);
    setAuthUser(null);
  }, []);

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
    setSelectedIvrCategory(null);
    setIvrInsights(null);
    setSelectedSoundboxCategory(null);
    setSoundboxInsights(null);
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
      } else if (selectedChannel === 'ivr') {
        const res = await axios.get(
          `${API_BASE}/ivr/analyse?category=${encodeURIComponent(selectedIvrCategory)}&date_range=${dateRange}`
        );
        setIvrInsights(res.data);
        return;
      } else if (selectedChannel === 'soundbox') {
        const res = await axios.get(
          `${API_BASE}/soundbox/analyse?category=${encodeURIComponent(selectedSoundboxCategory)}&date_range=${dateRange}`
        );
        setSoundboxInsights(res.data);
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
  }, [selectedChannel, appStoreApp, helpdeskType, helpdeskProduct, dateRange, selectedCampaign, selectedIvrCategory, selectedSoundboxCategory]);

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

  // Show spinner while exchanging OAuth code or validating stored token
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e0e7ff 100%)',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem', marginBottom: '1.25rem',
          boxShadow: '0 4px 14px rgba(99,102,241,.35)',
        }}>💡</div>
        <div style={{ width: 36, height: 36, border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '.9rem' }}>Signing you in…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!authToken || !authUser) {
    return <Login error={authError} />;
  }

  return (
    <div className="app-wrapper">
      {/* ── Top bar ── */}
      <header className="topbar">
        <a className="topbar-brand" href="/">
          <div className="topbar-brand-icon">💡</div>
          <div>
            <div>Voice of Customer</div>
            <div className="topbar-subtitle">Customer Intelligence Platform</div>
          </div>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {insights && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
              Last analysed: {new Date(insights.generated_at).toLocaleTimeString()}
            </div>
          )}
          {/* User avatar + sign out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            {authUser.picture && (
              <img
                src={authUser.picture}
                alt={authUser.name}
                style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid #e0e7ff' }}
              />
            )}
            <div style={{ fontSize: '.8rem', lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{authUser.name}</div>
              <div style={{ color: '#94a3b8', fontSize: '.72rem' }}>{authUser.email}</div>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                marginLeft: '.25rem', padding: '.3rem .75rem',
                fontSize: '.75rem', fontWeight: 600,
                background: 'none', border: '1px solid #e2e8f0',
                borderRadius: 8, cursor: 'pointer', color: '#64748b',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* ── Error banner ── */}
        {error && (
          <div className="error-banner">
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Channel selector + Session Search (side by side) ── */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ChannelSelector
              selectedChannel={selectedChannel}
              appStoreApp={appStoreApp}
              helpdeskType={helpdeskType}
              helpdeskCategory={helpdeskCategory}
              helpdeskProduct={helpdeskProduct}
              dateRange={dateRange}
              selectedCampaign={selectedCampaign}
              selectedIvrCategory={selectedIvrCategory}
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
              onSelectIvrCategory={(id) => {
                setSelectedIvrCategory(id);
                setIvrInsights(null);
              }}
              selectedSoundboxCategory={selectedSoundboxCategory}
              onSelectSoundboxCategory={(id) => {
                setSelectedSoundboxCategory(id);
                setSoundboxInsights(null);
              }}
              onAnalyse={handleAnalyse}
              loading={loading}
            />
          </div>

          {/* Session ID Search */}
          <form
            onSubmit={e => {
              e.preventDefault();
              const v = globalSearch.trim();
              if (v) { setGlobalTranscriptId(v); setGlobalSearch(''); }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0, alignSelf: 'flex-start', marginTop: '.35rem' }}
          >
            <input
              type="text"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Search session ID…"
              style={{
                padding: '.45rem .75rem', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: '.82rem',
                outline: 'none', color: '#334155', width: 220,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            <button
              type="submit"
              disabled={!globalSearch.trim()}
              style={{
                padding: '.45rem .65rem', borderRadius: 8, border: 'none',
                background: globalSearch.trim() ? '#6366f1' : '#e2e8f0',
                color: globalSearch.trim() ? '#fff' : '#94a3b8',
                fontSize: '1rem', cursor: globalSearch.trim() ? 'pointer' : 'not-allowed',
                lineHeight: 1,
              }}
            >
              🔍
            </button>
          </form>
        </div>

        {/* Global session transcript modal */}
        {globalTranscriptId && (
          <TranscriptModal
            ticketId={globalTranscriptId}
            helpdeskType="merchant"
            showEval={true}
            recordingPath="ivr"
            onClose={() => setGlobalTranscriptId(null)}
          />
        )}

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

        {/* ── IVR view ── */}
        {selectedChannel === 'ivr' && !loading && ivrInsights && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label"># of Sessions</div>
                <div className="stat-value stat-primary">{ivrInsights.total_feedback.toLocaleString()}</div>
                <div className="stat-sub">AI IVR · Inbound</div>
                {ivrInsights.data_from && (
                  <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#64748b' }}>
                    📅 {ivrInsights.data_from === ivrInsights.data_until ? ivrInsights.data_from : `${ivrInsights.data_from} – ${ivrInsights.data_until}`}
                  </div>
                )}
              </div>
            </div>
            <IssueList issues={ivrInsights.top_issues} helpdeskType="merchant" showListenButton={true} recordingPath="ivr" showTranscript={true} />
          </>
        )}

        {/* ── AI Soundbox view ── */}
        {selectedChannel === 'soundbox' && !loading && soundboxInsights && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label"># of Sessions</div>
                <div className="stat-value stat-primary">{soundboxInsights.total_feedback.toLocaleString()}</div>
                <div className="stat-sub">AI Soundbox · AI Bot</div>
                {soundboxInsights.data_from && (
                  <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#64748b' }}>
                    📅 {soundboxInsights.data_from === soundboxInsights.data_until ? soundboxInsights.data_from : `${soundboxInsights.data_from} – ${soundboxInsights.data_until}`}
                  </div>
                )}
              </div>
            </div>
            <IssueList issues={soundboxInsights.top_issues} helpdeskType="merchant" showListenButton={true} recordingPath="ivr" />
          </>
        )}

        {/* ── Results ── */}
        {insights && !loading && selectedChannel !== 'campaigns' && (
          <>
            {/* Summary stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label"># of Sessions</div>
                <div className="stat-value stat-primary">{insights.total_feedback.toLocaleString()}</div>
                <div className="stat-sub">
                  {appStoreApp ? APP_LABELS[appStoreApp] || appStoreApp : insights.channels_analysed.join(', ')}
                </div>
                {insights.data_from && (
                  <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#64748b' }}>
                    📅 {insights.data_from === insights.data_until ? insights.data_from : `${insights.data_from} – ${insights.data_until}`}
                  </div>
                )}
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

        {selectedChannel === 'ivr' && !loading && !ivrInsights && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">📱</div>
            <h3>Select a category above and click Analyse</h3>
            <p>View top issues, customer voice, and call insights from MHD Call Center inbound calls.</p>
          </div>
        )}

        {selectedChannel === 'soundbox' && !loading && !soundboxInsights && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">🔊</div>
            <h3>Select a category above and click Analyse</h3>
            <p>View top issues and customer voice from AI Soundbox bot calls.</p>
          </div>
        )}

        {!insights && !campaignDetail && !ivrInsights && !soundboxInsights && !loading && !error && selectedChannel !== 'campaigns' && selectedChannel !== 'ivr' && selectedChannel !== 'soundbox' && (
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
