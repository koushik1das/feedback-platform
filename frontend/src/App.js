/**
 * App.js – Root application component.
 *
 * Channels:
 *   app_store → Google Play MCP (TODO: wire MCP when available)
 *   helpdesk  → Trino via /api/helpdesk/analyse
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import ChannelSelector    from './components/ChannelSelector';
import TopIssues          from './components/TopIssues';
import EscalationStats    from './components/EscalationStats';
import IssueList          from './components/IssueList';
import FeedbackTable      from './components/FeedbackTable';
import CampaignDashboard  from './components/CampaignDashboard';
import Login              from './components/Login';
import TranscriptModal    from './components/TranscriptModal';
import HelpBot            from './components/HelpBot';
import { API_BASE }       from './config';

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

function relativeDate(utcStr) {
  if (!utcStr) return '';
  const sessionDate = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z');
  const now = new Date();
  // Compare calendar dates in local time
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
  const todayDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays   = Math.round((todayDay - sessionDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  return `${Math.floor(diffDays / 30)} months ago`;
}

// ─── RCA Bot helpers ──────────────────────────────────────────────────────────

const rcaMdComponents = {
  table: props => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.8rem' }} {...props} />
    </div>
  ),
  thead: props => <thead style={{ background: '#e2e8f0' }} {...props} />,
  th: props => <th style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'left', fontWeight: 600 }} {...props} />,
  td: props => <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px' }} {...props} />,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />,
  p: props => <p style={{ margin: '4px 0', lineHeight: 1.6 }} {...props} />,
  strong: props => <strong style={{ fontWeight: 700 }} {...props} />,
  h3: props => <h3 style={{ fontSize: '.88rem', fontWeight: 700, margin: '10px 0 4px' }} {...props} />,
  h4: props => <h4 style={{ fontSize: '.84rem', fontWeight: 700, margin: '8px 0 4px' }} {...props} />,
  ul: props => <ul style={{ paddingLeft: '1.2em', margin: '4px 0' }} {...props} />,
  ol: props => <ol style={{ paddingLeft: '1.2em', margin: '4px 0' }} {...props} />,
  li: props => <li style={{ margin: '2px 0' }} {...props} />,
};

function RcaMessage({ role, content }) {
  const isBot = role === 'assistant';
  return (
    <div style={{
      display: 'flex', justifyContent: isBot ? 'flex-start' : 'flex-end',
      marginBottom: '12px',
    }}>
      <div style={{
        maxWidth: '90%', padding: '10px 14px',
        background: isBot ? '#f8fafc' : '#2563eb',
        color: isBot ? '#1e293b' : '#fff',
        borderRadius: isBot ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        fontSize: '.82rem', lineHeight: 1.6,
        wordBreak: 'break-word',
        border: isBot ? '1px solid #e2e8f0' : 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        {isBot
          ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={rcaMdComponents}>{content}</ReactMarkdown>
          : content}
      </div>
    </div>
  );
}

function RcaLoader({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px 14px 14px 14px', maxWidth: '85%', marginBottom: 12 }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid #dbeafe', borderTopColor: '#2563eb',
        animation: 'spin 0.8s linear infinite', flexShrink: 0,
      }} />
      <span style={{ fontSize: '.8rem', color: '#475569' }}>{label}</span>
    </div>
  );
}

function RcaErrorBubble({ content, onRetry, soft }) {
  if (soft) {
    // Not-found / no-logs — grey info style, no retry
    return (
      <div style={{ marginBottom: 12, maxWidth: '90%' }}>
        <div style={{ padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px 14px 14px 14px', fontSize: '.78rem', color: '#64748b', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ fontSize: '.85rem', flexShrink: 0 }}>ℹ️</span>
          <span>{content}</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 12, maxWidth: '90%' }}>
      <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px 14px 14px 14px', fontSize: '.82rem', color: '#dc2626', lineHeight: 1.5 }}>
        {content}
      </div>
      {onRetry && (
        <button onClick={onRetry} style={{
          marginTop: 6, fontSize: '.72rem', fontWeight: 700,
          background: '#dc2626', color: '#fff', border: 'none',
          borderRadius: 6, padding: '4px 14px', cursor: 'pointer',
        }}>
          ↻ Retry
        </button>
      )}
    </div>
  );
}

function MidDrawer({ midSessions, onClose, onViewTranscript, rcaMessages, setRcaMessages, rcaInput, setRcaInput, rcaLoading, setRcaLoading, rcaChatEndRef, onSearch }) {
  const API = API_BASE;
  const autoFired   = useRef(false);
  const lastMsgRef  = useRef('__auto__');
  const [midSearchVal, setMidSearchVal] = useState('');

  // Auto-trigger initial RCA analysis when drawer first opens (ref guard prevents StrictMode double-fire)
  useEffect(() => {
    if (autoFired.current) return;
    autoFired.current = true;
    sendRca('__auto__');
  }, []); // eslint-disable-line

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (rcaChatEndRef.current) rcaChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [rcaMessages, rcaLoading, rcaChatEndRef]);

  async function sendRca(message, isRetry = false) {
    lastMsgRef.current = message;
    const userMsg = message === '__auto__' ? null : message;

    // On retry: strip trailing error (and the user bubble that preceded it) from state,
    // and rebuild history without them so the LLM doesn't see duplicates.
    let baseMessages;
    if (isRetry) {
      setRcaMessages(prev => {
        // Drop trailing error message; if the message before it is the same user bubble, drop that too
        let msgs = prev.filter(m => m.role !== 'error');
        if (msgs.length && msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content === userMsg) {
          msgs = msgs.slice(0, -1);
        }
        baseMessages = msgs;
        return msgs;
      });
    } else {
      baseMessages = rcaMessages.filter(m => m.role !== '__typing__' && m.role !== 'error');
    }

    const history = (baseMessages || rcaMessages.filter(m => m.role !== '__typing__' && m.role !== 'error'));

    // Add user bubble (skip for auto and retry — retry re-adds it below after state settles)
    if (userMsg && !isRetry) {
      setRcaMessages(prev => [...prev, { role: 'user', content: userMsg }]);
      setRcaInput('');
    } else if (userMsg && isRetry) {
      setRcaMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    }
    setRcaLoading(true);

    try {
      const res = await fetch(`${API}/helpdesk/rca-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mid: midSessions.mid,
          sessions: midSessions.sessions,
          message,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.detail || `Server error ${res.status}`;
        setRcaMessages(prev => [...prev, { role: 'error', content: errMsg }]);
      } else if (data.loki_error) {
        const sid = data.session_id ? ` (${data.session_id})` : '';
        const errMsg = data.loki_error;
        const isNotFound = /no traceid|not found|no loki logs/i.test(errMsg);
        const isTransient = /timeout|timed out|gateway|server error|503|504/i.test(errMsg);
        setRcaMessages(prev => [...prev, {
          role: 'error',
          content: isNotFound
            ? `No Loki logs available for session${sid}. This session may not have gone through the AI bot.`
            : `Failed to fetch Loki logs${sid}: ${errMsg}`,
          soft: isNotFound && !isTransient,
        }]);
      } else if (data.answer) {
        setRcaMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      } else {
        setRcaMessages(prev => [...prev, { role: 'error', content: 'LLM returned an empty response. Check server logs.' }]);
      }
    } catch (err) {
      setRcaMessages(prev => [
        ...prev,
        { role: 'error', content: `Network error: ${err.message}` },
      ]);
    } finally {
      setRcaLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (rcaInput.trim() && !rcaLoading) sendRca(rcaInput.trim());
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', zIndex: 1000 }} />

      {/* Drawer — 90% wide */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '90%', background: '#f8fafc', zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 48px rgba(0,0,0,.22)',
      }}>
        {/* ── Top header bar ── */}
        <div style={{
          padding: '.8rem 1.25rem', borderBottom: '1px solid #e2e8f0',
          background: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#0f172a' }}>MID Analysis</div>
            <span style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 4 }}>{midSessions.mid}</span>
            <span style={{ fontSize: '.75rem', color: '#64748b' }}>{midSessions.sessions.length} session{midSessions.sessions.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {onSearch && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const v = midSearchVal.trim();
                  if (!v) return;
                  setMidSearchVal('');
                  onClose();
                  onSearch(v);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}
              >
                <input
                  type="text"
                  value={midSearchVal}
                  onChange={e => setMidSearchVal(e.target.value)}
                  placeholder="Search Session / Merchant ID"
                  style={{
                    padding: '.38rem .65rem', borderRadius: 7,
                    border: '1.5px solid #e2e8f0', fontSize: '.78rem',
                    outline: 'none', color: '#334155', width: 210,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                />
                <button
                  type="submit"
                  disabled={!midSearchVal.trim()}
                  style={{
                    padding: '.38rem .55rem', borderRadius: 7, border: 'none',
                    background: midSearchVal.trim() ? '#2563eb' : '#e2e8f0',
                    color: midSearchVal.trim() ? '#fff' : '#94a3b8',
                    fontSize: '.9rem', cursor: midSearchVal.trim() ? 'pointer' : 'not-allowed',
                    lineHeight: 1,
                  }}
                >🔍</button>
              </form>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
          </div>
        </div>

        {/* ── Body: two columns ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: timeline — 28% */}
          <div style={{
            width: '28%', borderRight: '1px solid #e2e8f0',
            background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '.65rem 1rem', borderBottom: '1px solid #f1f5f9', fontSize: '.72rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }}>
              Sessions across channels
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 0 1rem 1rem' }}>
              {/* Timeline vertical track */}
              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                {/* Vertical line */}
                <div style={{ position: 'absolute', left: '6px', top: 0, bottom: 0, width: '2px', background: '#e2e8f0' }} />

                {midSessions.sessions.map((s, idx) => (
                  <div key={s.session_id} style={{ position: 'relative', marginBottom: '1.25rem' }}>
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute', left: '-17px', top: '4px',
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: '#2563eb', border: '2px solid #fff',
                      boxShadow: '0 0 0 2px #2563eb',
                      flexShrink: 0,
                    }} />

                    {/* Timestamp badge */}
                    {s.created_at && (
                      <div style={{
                        display: 'inline-block',
                        fontSize: '.68rem', fontWeight: 700, color: '#2563eb',
                        background: '#eff6ff', borderRadius: 4,
                        padding: '1px 7px', marginBottom: '5px',
                        letterSpacing: '.02em',
                      }}>
                        {relativeDate(s.created_at)}
                      </div>
                    )}

                    {/* Channel pill */}
                    {s.cst_entity && (
                      <span style={{
                        display: 'inline-block', marginLeft: 5,
                        fontSize: '.62rem', background: '#f1f5f9', color: '#475569',
                        borderRadius: 4, padding: '1px 6px', fontWeight: 500,
                      }}>{s.cst_entity}</span>
                    )}

                    {/* Conversation summary */}
                    <div style={{ fontSize: '.75rem', color: '#1e293b', lineHeight: 1.45, marginTop: '3px' }}>
                      {s.issue_l1 && (
                        <span style={{ fontWeight: 600, color: '#334155' }}>{s.issue_l1}</span>
                      )}
                      {s.issue_l1 && s.issue_l2 && (
                        <span style={{ color: '#94a3b8' }}> › </span>
                      )}
                      {s.issue_l2 && (
                        <span style={{ color: '#475569' }}>{s.issue_l2}</span>
                      )}
                      {s.helpdesk_summary && (
                        <div style={{ fontSize: '.71rem', color: '#64748b', marginTop: '3px', lineHeight: 1.4 }}>
                          {s.helpdesk_summary}
                        </div>
                      )}
                    </div>

                    {/* Session ID fine print + copy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: '4px' }}>
                      <span style={{ fontSize: '.6rem', fontFamily: 'monospace', color: '#cbd5e1', wordBreak: 'break-all' }}>
                        {s.session_id}
                      </span>
                      <button
                        title="Copy session ID"
                        onClick={() => navigator.clipboard.writeText(s.session_id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#cbd5e1', lineHeight: 1, flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </div>

                    {/* View Transcript */}
                    <button
                      onClick={() => onViewTranscript(s.session_id)}
                      style={{ marginTop: '5px', fontSize: '.63rem', fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 9px', cursor: 'pointer' }}
                    >
                      View Transcript
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: RCA Bot — 72% */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* RCA Bot header */}
            <div style={{ padding: '.65rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontWeight: 600, fontSize: '.85rem', color: '#0f172a' }}>RCA Bot</span>
              <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Root Cause Analysis · All sessions</span>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              {rcaMessages.map((m, i) =>
                m.role === 'error'
                  ? <RcaErrorBubble key={i} content={m.content} soft={m.soft} onRetry={m.soft ? null : () => sendRca(lastMsgRef.current, true)} />
                  : <RcaMessage key={i} role={m.role} content={m.content} />
              )}
              {rcaLoading && (
                <RcaLoader label={
                  rcaMessages.length === 0
                    ? `Analysing ${midSessions.sessions.length} sessions…`
                    : 'Fetching logs from Loki…'
                } />
              )}
              <div ref={rcaChatEndRef} />
            </div>

            {/* Input bar */}
            <div style={{ padding: '.85rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                value={rcaInput}
                onChange={e => setRcaInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about this merchant… (Enter to send)"
                rows={2}
                disabled={rcaLoading}
                style={{
                  flex: 1, resize: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '8px 12px', fontSize: '.82rem', lineHeight: 1.5,
                  outline: 'none', fontFamily: 'inherit', color: '#1e293b',
                  background: rcaLoading ? '#f8fafc' : '#fff',
                }}
              />
              <button
                onClick={() => { if (rcaInput.trim() && !rcaLoading) sendRca(rcaInput.trim()); }}
                disabled={!rcaInput.trim() || rcaLoading}
                style={{
                  padding: '8px 18px', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '.82rem',
                  cursor: rcaInput.trim() && !rcaLoading ? 'pointer' : 'not-allowed',
                  opacity: rcaInput.trim() && !rcaLoading ? 1 : 0.5, flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
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
  const [midSessions,              setMidSessions]              = useState(null);  // {mid, sessions[]}
  const [midLoading,               setMidLoading]               = useState(false);
  const [midError,                 setMidError]                 = useState(null);
  const [rcaMessages,              setRcaMessages]              = useState([]);    // [{role,content}]
  const [rcaInput,                 setRcaInput]                 = useState('');
  const [rcaLoading,               setRcaLoading]               = useState(false);
  const rcaChatEndRef = useRef(null);

  const handleGlobalSearch = (v) => {
    const looksLikeMid = !v.includes('-') && !/^\d/.test(v);
    if (looksLikeMid) {
      setMidSessions(null); setMidError(null); setMidLoading(true);
      axios.get(`${API_BASE}/helpdesk/sessions-by-mid/${encodeURIComponent(v)}`)
        .then(res => setMidSessions({ mid: v, sessions: res.data }))
        .catch(err => setMidError(err.response?.data?.detail || 'MID lookup failed.'))
        .finally(() => setMidLoading(false));
    } else {
      setGlobalTranscriptId(v);
    }
  };

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
            const dateStr = iss.comment_dates?.[i] || null;
            rows.push({
              id:            `${iss.label}-${i}`,
              source:        'helpdesk_zendesk',
              channel:       'helpdesk',
              timestamp:     dateStr ? new Date(dateStr).toISOString() : null,
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
        background: 'linear-gradient(135deg, #f1f5f9 0%, #dbeafe 100%)',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem', marginBottom: '1.25rem',
          boxShadow: '0 4px 14px rgba(99,102,241,.35)',
        }}>💡</div>
        <div style={{ width: 36, height: 36, border: '3px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
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
                style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid #dbeafe' }}
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

          {/* Session / Merchant ID Search */}
          <form
            onSubmit={e => {
              e.preventDefault();
              const v = globalSearch.trim();
              if (!v) return;
              setGlobalSearch('');
              handleGlobalSearch(v);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0, alignSelf: 'flex-start', marginTop: '.35rem' }}
          >
            <input
              type="text"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Search Session / Merchant ID"
              style={{
                padding: '.45rem .75rem', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: '.82rem',
                outline: 'none', color: '#334155', width: 220,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            <button
              type="submit"
              disabled={!globalSearch.trim()}
              style={{
                padding: '.45rem .65rem', borderRadius: 8, border: 'none',
                background: globalSearch.trim() ? '#2563eb' : '#e2e8f0',
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
            helpdeskType={globalTranscriptId.startsWith('3-') ? 'customer' : 'merchant'}
            showEval={true}
            recordingPath="ivr"
            onClose={() => setGlobalTranscriptId(null)}
            onSearch={(v) => { setGlobalTranscriptId(null); handleGlobalSearch(v); }}
          />
        )}

        {/* MID lookup — loading spinner */}
        {midLoading && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '2rem 2.5rem', textAlign: 'center', color: '#64748b' }}>
              <style>{`@keyframes appSpin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'appSpin .7s linear infinite', margin: '0 auto 1rem' }} />
              Looking up sessions for MID…
            </div>
          </div>
        )}

        {/* MID lookup — error */}
        {midError && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setMidError(null)}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem 2rem', color: '#dc2626', maxWidth: 360 }}>
              <strong>MID lookup failed</strong><br/><span style={{ fontSize: '.85rem' }}>{midError}</span>
              <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                <button onClick={() => setMidError(null)} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#f1f5f9', cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* MID lookup — full-width split drawer */}
        {midSessions && (
          <MidDrawer
            midSessions={midSessions}
            onClose={() => { setMidSessions(null); setRcaMessages([]); setRcaInput(''); }}
            onViewTranscript={(sid) => { setGlobalTranscriptId(sid); setMidSessions(null); setRcaMessages([]); }}
            rcaMessages={rcaMessages}
            setRcaMessages={setRcaMessages}
            rcaInput={rcaInput}
            setRcaInput={setRcaInput}
            rcaLoading={rcaLoading}
            setRcaLoading={setRcaLoading}
            rcaChatEndRef={rcaChatEndRef}
            onSearch={(v) => { setMidSessions(null); setRcaMessages([]); setRcaInput(''); handleGlobalSearch(v); }}
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

      {/* Help Bot — floating on all pages */}
      <HelpBot />
    </div>
  );
}
