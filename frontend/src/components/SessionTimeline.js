/**
 * SessionTimeline — Debug Bot: fetches Loki logs, auto-summarises, allows Q&A.
 * Used as the "Debug Bot" tab in TranscriptModal.
 */

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

// ── Colour palette by event type ─────────────────────────────────────────────

const TYPE_STYLE = {
  session_start:   { dot: '#10b981', badge: '#dcfce7', text: '#065f46', label: 'Session Start' },
  session_end:     { dot: '#6b7280', badge: '#f1f5f9', text: '#374151', label: 'Session End'   },
  workflow:        { dot: '#3b82f6', badge: '#dbeafe', text: '#1e40af', label: 'Workflow'       },
  master_data:     { dot: '#3b82f6', badge: '#dbeafe', text: '#1e40af', label: 'Master Data'   },
  transformer:     { dot: '#3b82f6', badge: '#dbeafe', text: '#1e40af', label: 'Transformer'   },
  intent:          { dot: '#1d4ed8', badge: '#dbeafe', text: '#1e3a8a', label: 'Intent'        },
  user_message:    { dot: '#0ea5e9', badge: '#e0f2fe', text: '#0369a1', label: 'User Message'  },
  bot_response:    { dot: '#2563eb', badge: '#dbeafe', text: '#1e40af', label: 'Bot Response'  },
  greeting:        { dot: '#2563eb', badge: '#dbeafe', text: '#1e40af', label: 'Greeting'      },
  function_call:   { dot: '#f59e0b', badge: '#fef3c7', text: '#92400e', label: 'Function Call' },
  function_result: { dot: '#d97706', badge: '#fef9c3', text: '#78350f', label: 'FC Result'     },
  handoff:         { dot: '#ef4444', badge: '#fee2e2', text: '#991b1b', label: 'Handoff'       },
  error:           { dot: '#ef4444', badge: '#fef2f2', text: '#b91c1c', label: 'Error'         },
  warning:         { dot: '#f59e0b', badge: '#fffbeb', text: '#92400e', label: 'Warning'       },
  info:            { dot: '#94a3b8', badge: '#f8fafc', text: '#475569', label: 'Info'          },
};

function typeStyle(type) {
  return TYPE_STYLE[type] || TYPE_STYLE.info;
}

// ── Duration formatter ────────────────────────────────────────────────────────

function fmtOffset(ms) {
  if (ms == null || ms < 0) return '';
  if (ms < 1000)  return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function fmtTs(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch {
    return iso.slice(11, 19) || iso;
  }
}

// ── Single event node ─────────────────────────────────────────────────────────

function EventNode({ event, isLast }) {
  const [open, setOpen] = useState(false);
  const s = typeStyle(event.type);
  const hasDetail = event.raw && (Object.keys(event.meta || {}).length > 0 || event.raw.length > 120);

  return (
    <div style={{ display: 'flex', gap: '0', position: 'relative' }}>
      {/* ── Spine ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: s.dot,
          border: '2px solid #fff', boxShadow: `0 0 0 2px ${s.dot}33`,
          flexShrink: 0, marginTop: 14, zIndex: 1,
        }} />
        {!isLast && (
          <div style={{ width: 2, flex: 1, background: '#e2e8f0', minHeight: 16 }} />
        )}
      </div>

      {/* ── Card ── */}
      <div style={{ flex: 1, marginBottom: 6, marginLeft: 6 }}>
        <button
          onClick={() => hasDetail && setOpen(o => !o)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: hasDetail ? 'pointer' : 'default',
            textAlign: 'left', padding: '6px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.7rem' }}>{event.icon}</span>
            <span style={{
              fontSize: '.62rem', fontWeight: 700, background: s.badge, color: s.text,
              borderRadius: 4, padding: '1px 6px', letterSpacing: '.04em',
            }}>
              {s.label}
            </span>
            {event.level && event.level !== 'INFO' && (
              <span style={{
                fontSize: '.6rem', fontWeight: 700,
                color: event.level === 'ERROR' || event.level === 'FATAL' ? '#b91c1c' : '#92400e',
              }}>
                {event.level}
              </span>
            )}
            <span style={{ fontSize: '.72rem', color: '#0f172a', flex: 1, lineHeight: 1.4 }}>
              {event.message || '(no message)'}
            </span>
            <span style={{ fontSize: '.62rem', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
              {fmtTs(event.timestamp)}
              {event.offset_ms != null && (
                <span style={{ color: '#cbd5e1', marginLeft: 4 }}>{fmtOffset(event.offset_ms)}</span>
              )}
            </span>
            {hasDetail && (
              <span style={{ fontSize: '.65rem', color: '#cbd5e1',
                transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
            )}
          </div>
        </button>

        {/* ── Expanded detail ── */}
        {open && hasDetail && (
          <div style={{
            marginBottom: 6, borderRadius: 6, overflow: 'hidden',
            border: `1px solid ${s.dot}44`, background: `${s.badge}88`,
          }}>
            {/* Key-value meta */}
            {Object.keys(event.meta || {}).length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
                <tbody>
                  {Object.entries(event.meta).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '3px 8px', color: '#64748b', fontWeight: 600,
                        width: '30%', verticalAlign: 'top', borderBottom: '1px solid #f1f5f9' }}>
                        {k}
                      </td>
                      <td style={{ padding: '3px 8px', color: '#1e293b', wordBreak: 'break-word',
                        borderBottom: '1px solid #f1f5f9' }}>
                        {String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Raw log */}
            <details>
              <summary style={{ fontSize: '.65rem', color: '#94a3b8', padding: '4px 8px',
                cursor: 'pointer', userSelect: 'none' }}>
                Raw log line
              </summary>
              <pre style={{
                margin: 0, padding: '6px 8px', fontSize: '.68rem', lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#475569',
              }}>
                {event.raw}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase group ───────────────────────────────────────────────────────────────

const PHASE_COLOR = {
  Session:       '#10b981',
  Workflow:      '#3b82f6',
  NLU:           '#3b82f6',
  User:          '#0ea5e9',
  Bot:           '#2563eb',
  'Function Call': '#f59e0b',
  Escalation:    '#ef4444',
  Error:         '#ef4444',
  Warning:       '#f59e0b',
  Other:         '#94a3b8',
};

function PhaseGroup({ phase, events }) {
  const [collapsed, setCollapsed] = useState(false);
  const color = PHASE_COLOR[phase] || '#94a3b8';

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Phase header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 4, padding: '2px 0',
        }}
      >
        <div style={{ width: 3, height: 16, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.08em', color: '#64748b' }}>
          {phase}
        </span>
        <span style={{ fontSize: '.65rem', color: '#94a3b8' }}>({events.length})</span>
        <span style={{ fontSize: '.6rem', color: '#cbd5e1', marginLeft: 2,
          transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>

      {!collapsed && (
        <div style={{ paddingLeft: 4 }}>
          {events.map((e, i) => (
            <EventNode key={i} event={e} isLast={i === events.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ events }) {
  const total    = events.length;
  const errors   = events.filter(e => e.type === 'error').length;
  const warnings = events.filter(e => e.type === 'warning').length;
  const fnCalls  = events.filter(e => e.type === 'function_call').length;

  // Duration
  const withTs = events.filter(e => e.offset_ms != null);
  const maxMs  = withTs.length ? Math.max(...withTs.map(e => e.offset_ms)) : null;

  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', padding: '8px 12px',
      background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '.72rem',
    }}>
      <Chip label="Events"    value={total}    color="#3b82f6" />
      {maxMs != null && <Chip label="Duration" value={fmtOffset(maxMs)} color="#2563eb" />}
      {fnCalls  > 0 && <Chip label="API calls"  value={fnCalls}  color="#f59e0b" />}
      {warnings > 0 && <Chip label="Warnings"  value={warnings} color="#f59e0b" />}
      {errors   > 0 && <Chip label="Errors"    value={errors}   color="#ef4444" />}
    </div>
  );
}

function Chip({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#94a3b8' }}>{label}:</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── Time window input ─────────────────────────────────────────────────────────

function nowIST() {
  // Return current IST datetime as "YYYY-MM-DDTHH:MM" (datetime-local format)
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 16);
}

function WindowPicker({ datetime, onDatetimeChange, onSearch, loading }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
    }}>
      <span style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>Session time (IST):</span>
      <input
        type="datetime-local"
        value={datetime}
        onChange={e => onDatetimeChange(e.target.value)}
        style={{
          fontSize: '.78rem', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '3px 8px', color: '#0f172a', background: '#fff',
        }}
      />
      <button
        onClick={onSearch}
        disabled={loading || !datetime}
        style={{
          fontSize: '.75rem', fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
          background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
          padding: '4px 14px', opacity: loading ? .6 : 1,
        }}
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
      <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>
        Searches ±2h window around the session time
      </span>
    </div>
  );
}

// ── Log Query Bot ─────────────────────────────────────────────────────────────

// ── Markdown bubble ───────────────────────────────────────────────────────────

const mdComponents = {
  p:      ({ children }) => <p style={{ margin: '0 0 6px' }}>{children}</p>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{children}</ol>,
  li:     ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  em:     ({ children }) => <em>{children}</em>,
  code: ({ children, className }) => {
    // Block code (inside <pre>) has a className like "language-json"; inline does not
    if (className) {
      return (
        <code style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#e2e8f0' }}>
          {children}
        </code>
      );
    }
    // Inline code
    return (
      <code style={{
        background: '#e2e8f0', borderRadius: 3, padding: '1px 5px',
        fontSize: '.72rem', fontFamily: 'monospace', color: '#1e293b',
      }}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre style={{
      background: '#1e293b', color: '#e2e8f0', borderRadius: 6,
      padding: '10px 12px', fontSize: '.72rem', overflowX: 'auto',
      margin: '4px 0 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      lineHeight: 1.6,
    }}>{children}</pre>
  ),
  h1: ({ children }) => <p style={{ fontWeight: 700, fontSize: '.82rem', margin: '6px 0 4px' }}>{children}</p>,
  h2: ({ children }) => <p style={{ fontWeight: 700, fontSize: '.8rem',  margin: '6px 0 4px' }}>{children}</p>,
  h3: ({ children }) => <p style={{ fontWeight: 700, fontSize: '.78rem', margin: '4px 0 2px' }}>{children}</p>,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{
        borderCollapse: 'collapse', fontSize: '.74rem',
        width: '100%', minWidth: 300,
      }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: '#e2e8f0' }}>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr:    ({ children }) => <tr style={{ borderBottom: '1px solid #e2e8f0' }}>{children}</tr>,
  th:    ({ children }) => (
    <th style={{
      padding: '5px 10px', textAlign: 'left', fontWeight: 700,
      color: '#374151', whiteSpace: 'nowrap', borderBottom: '2px solid #cbd5e1',
    }}>{children}</th>
  ),
  td:    ({ children }) => (
    <td style={{
      padding: '4px 10px', color: '#1e293b', verticalAlign: 'top',
      wordBreak: 'break-word',
    }}>{children}</td>
  ),
};

// ── Debug Bot ─────────────────────────────────────────────────────────────────

function LogQueryBot({ sessionId, events, logsLoading }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [asking,    setAsking]    = useState(false);
  const summarisedRef = React.useRef(false);
  const bottomRef     = React.useRef(null);

  // Auto-scroll on new messages
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  // Auto-summarise once logs are loaded
  React.useEffect(() => {
    if (logsLoading || !events.length || summarisedRef.current) return;
    summarisedRef.current = true;
    askBot('Summarise what happened in this session. Cover: channel, merchant, workflows triggered, outcome, and any errors or failures.');
  }, [events, logsLoading]); // eslint-disable-line

  async function askBot(query) {
    setAsking(true);
    try {
      const res = await axios.post(`${API_BASE}/helpdesk/log-query`, {
        session_id: sessionId,
        query,
        events,
      });
      setMessages(prev => [...prev, { role: 'bot', text: res.data.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: e.response?.data?.detail || 'Failed to get a response. Please try again.',
        error: true,
      }]);
    } finally {
      setAsking(false);
    }
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || asking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    await askBot(q);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Chat history */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Loading state: logs still being fetched */}
        {logsLoading && !messages.length && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '3rem', gap: '1.2rem', color: '#94a3b8' }}>
            {/* Progress bar — reaches 50% at 100s (half the 200s timeout) */}
            <div style={{ width: '60%', maxWidth: 320, background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: '#3b82f6',
                animation: 'barProgress 200s linear forwards',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%', width: '30%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent)',
                  animation: 'shimmer 1.8s ease-in-out infinite',
                }} />
              </div>
            </div>
            <span style={{ fontSize: '.82rem' }}>Fetching session logs…</span>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {m.role === 'bot' && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%', background: '#dbeafe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.8rem', flexShrink: 0, marginRight: 6, alignSelf: 'flex-end',
              }}>🤖</div>
            )}
            <div style={{
              maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
              fontSize: '.78rem', lineHeight: 1.6, wordBreak: 'break-word',
              background: m.role === 'user' ? '#2563eb' : m.error ? '#fef2f2' : '#f1f5f9',
              color:      m.role === 'user' ? '#fff'    : m.error ? '#dc2626' : '#1e293b',
              borderBottomRightRadius: m.role === 'user' ? 2 : 12,
              borderBottomLeftRadius:  m.role === 'bot'  ? 2 : 12,
            }}>
              {m.role === 'bot' && !m.error
                ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{m.text}</ReactMarkdown>
                : m.text
              }
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {asking && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: '#dbeafe',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem',
            }}>🤖</div>
            <div style={{
              padding: '10px 14px', borderRadius: 12, borderBottomLeftRadius: 2,
              background: '#f1f5f9', display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#94a3b8',
                  animation: `bounce .9s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        borderTop: '1px solid #e2e8f0', padding: '10px 14px',
        display: 'flex', gap: 8, background: '#fff',
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={logsLoading ? 'Loading logs…' : 'Ask anything about this session…'}
          disabled={asking || logsLoading}
          style={{
            flex: 1, fontSize: '.8rem', padding: '8px 12px',
            border: '1px solid #e2e8f0', borderRadius: 20,
            outline: 'none', color: '#0f172a',
            background: (asking || logsLoading) ? '#f8fafc' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={asking || logsLoading || !input.trim()}
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: (asking || logsLoading || !input.trim()) ? '#e2e8f0' : '#2563eb',
            color: '#fff', border: 'none',
            cursor: (asking || logsLoading || !input.trim()) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SessionTimeline({ sessionId, startTime, endTime, sessionDatetime, helpdeskType }) {
  const [events,          setEvents]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [datetime,        setDatetime]        = useState(nowIST());
  const [retryCountdown,  setRetryCountdown]  = useState(null); // null = no auto-retry pending
  const userEditedRef  = React.useRef(false);
  const retryTimerRef  = React.useRef(null);

  // Auto-retry: when an error appears, start 5s countdown then retry once
  useEffect(() => {
    if (!error || events.length > 0) {
      setRetryCountdown(null);
      return;
    }
    setRetryCountdown(5);
  }, [error]);

  useEffect(() => {
    if (retryCountdown === null) return;
    if (retryCountdown === 0) {
      handleSearch();
      setRetryCountdown(null);
      return;
    }
    retryTimerRef.current = setTimeout(() => setRetryCountdown(c => c - 1), 1000);
    return () => clearTimeout(retryTimerRef.current);
  }, [retryCountdown]);

  function cancelAutoRetry() {
    clearTimeout(retryTimerRef.current);
    setRetryCountdown(null);
  }

  function buildWindow(dt) {
    // dt is an IST datetime string "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS".
    // Append 'Z' so JS treats the IST value as-is (no tz shift), then ±2h
    // and toISOString() produces IST strings for Loki.
    if (!dt) return { start_time: null, end_time: null };
    const base    = new Date(dt + 'Z').getTime();
    const minus2h = new Date(base - 2 * 3600 * 1000);
    const plus2h  = new Date(base + 2 * 3600 * 1000);
    return {
      start_time: minus2h.toISOString().slice(0, 19),
      end_time:   plus2h.toISOString().slice(0, 19),
    };
  }

  function fetchTimeline(overrideStart, overrideEnd) {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setEvents([]);

    const params = new URLSearchParams();
    const st = overrideStart || startTime;
    const et = overrideEnd   || endTime;
    if (st) params.set('start_time', st);
    if (et) params.set('end_time',   et);
    if (helpdeskType) params.set('helpdesk_type', helpdeskType);
    const qs = params.toString() ? `?${params}` : '';

    axios.get(`${API_BASE}/helpdesk/session-timeline/${sessionId}${qs}`, { timeout: 200000 })
      .then(res => setEvents(res.data || []))
      .catch(e  => setError(e.response?.data?.detail || 'Failed to load session timeline.'))
      .finally(() => setLoading(false));
  }

  // Wait for sessionDatetime (arrives after messages load), then set picker + fetch.
  // userEditedRef prevents overwriting a manual picker change.
  useEffect(() => {
    if (!sessionDatetime) return;
    const istDt = sessionDatetime.slice(0, 16);
    if (!userEditedRef.current) {
      setDatetime(istDt);
    }
    const { start_time, end_time } = buildWindow(istDt);
    fetchTimeline(start_time, end_time);
  }, [sessionId, sessionDatetime]); // re-run when session or its datetime changes

  function handleDatetimeChange(val) {
    userEditedRef.current = true;
    setDatetime(val);
  }

  function handleSearch() {
    cancelAutoRetry();
    const { start_time, end_time } = buildWindow(datetime);
    fetchTimeline(start_time, end_time);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes bounce      { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
        @keyframes barProgress {
          0%   { width: 0% }
          5%   { width: 50% }
          10%  { width: 75% }
          15%  { width: 87.5% }
          20%  { width: 93.75% }
          25%  { width: 96.875% }
          30%  { width: 98.4% }
          100% { width: 99% }
        }
        @keyframes shimmer     { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
      `}</style>

      {/* Error banner — only show if no events loaded (avoids stale error from previous fetch) */}
      {error && events.length === 0 && (
        <div style={{
          margin: '8px 14px 0', background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '.78rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>
            {error.includes('504') || error.includes('timeout') || error.includes('Gateway') || error.includes('timed out')
              ? <><strong>Loki MCP timed out.</strong> The log server is slow — please try again.</>
              : error.includes('not found') || error.includes('No traceId')
                ? <><strong>No logs found</strong> for this session. It may not have gone through the AI bot.<br/><span style={{fontSize:'.73rem',color:'#b91c1c',opacity:.8}}>{error}</span></>
                : <><strong>Error:</strong> {error}</>
            }
          </span>
          {(
            error.includes('504') || error.includes('timeout') || error.includes('Gateway') ||
            error.includes('timed out') || error.includes('not found') || error.includes('No traceId')
          ) && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              {retryCountdown !== null && (
                <button onClick={cancelAutoRetry} style={{
                  fontSize: '.72rem', fontWeight: 600, background: 'transparent',
                  color: '#dc2626', border: '1px solid #fca5a5',
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                }}>
                  Cancel ({retryCountdown}s)
                </button>
              )}
              <button onClick={handleSearch} style={{
                fontSize: '.75rem', fontWeight: 700,
                background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
              }}>
                ↻ Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bot — takes remaining height */}
      <LogQueryBot
        sessionId={sessionId}
        events={events}
        logsLoading={loading}
      />
    </div>
  );
}
