import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { API_BASE } from '../config';

// ── Sub-components ────────────────────────────────────────────────────────────

function DataTable({ columns, rows }) {
  if (!columns.length) return null;
  return (
    <div style={{ overflowX: 'auto', marginTop: '.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.78rem', minWidth: 300 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: '.45rem .75rem', textAlign: 'left',
                fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                borderBottom: '1px solid #e2e8f0',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '.4rem .75rem', color: '#334155',
                  borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                }}>
                  {cell === null || cell === undefined ? '—' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{
        padding: '.3rem .75rem', fontSize: '.7rem', color: '#94a3b8',
        background: '#f8fafc', borderTop: '1px solid #f1f5f9',
      }}>
        {rows.length} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function BotActions({ sql, columns, rows }) {
  const [showData, setShowData] = useState(false);
  const [showSql,  setShowSql]  = useState(false);
  if (!sql) return null;

  return (
    <div style={{ marginTop: '.65rem', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
      {/* CTA row */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {columns?.length > 0 && (
          <button
            onClick={() => setShowData(o => !o)}
            style={{
              fontSize: '.72rem', fontWeight: 600,
              color: showData ? '#1d4ed8' : '#2563eb',
              background: showData ? '#dbeafe' : '#eff6ff',
              border: `1px solid ${showData ? '#93c5fd' : '#bfdbfe'}`,
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            }}
          >
            {showData ? '▼ Hide Raw Data' : '📊 View Raw Data'}
          </button>
        )}
        <button
          onClick={() => setShowSql(o => !o)}
          style={{
            fontSize: '.72rem', color: '#64748b',
            background: showSql ? '#f1f5f9' : 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {showSql ? '▼ Hide SQL' : '▶ View SQL'}
        </button>
      </div>

      {/* Raw data table */}
      {showData && columns?.length > 0 && (
        <DataTable columns={columns} rows={rows} />
      )}

      {/* SQL */}
      {showSql && (
        <pre style={{
          padding: '.65rem .85rem', borderRadius: 8,
          background: '#0f172a', color: '#e2e8f0', fontSize: '.71rem',
          overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
        }}>
          {sql}
        </pre>
      )}
    </div>
  );
}

function Message({ msg }) {
  const isUser  = msg.role === 'user';
  const isError = msg.type === 'error';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '.9rem',
    }}>
      {!isUser && (
        <div style={{ fontSize: '.68rem', color: '#94a3b8', marginBottom: '.25rem', paddingLeft: '.2rem' }}>
          🤖 Help Bot
        </div>
      )}
      <div style={{
        maxWidth: '88%',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '.6rem .9rem',
        background: isUser ? '#2563eb' : isError ? '#fef2f2' : '#f8fafc',
        color: isUser ? '#fff' : isError ? '#dc2626' : '#1e293b',
        border: isUser ? 'none' : isError ? '1px solid #fca5a5' : '1px solid #e2e8f0',
        fontSize: '.84rem', lineHeight: 1.6,
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <>
            <div className="helpbot-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content || (msg.type === 'table' ? `Query returned **${msg.rows?.length ?? 0}** row(s). View the data below.` : '')}
              </ReactMarkdown>
            </div>
            <BotActions sql={msg.sql} columns={msg.columns} rows={msg.rows} />
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '.9rem' }}>
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '14px 14px 14px 4px',
        padding: '.55rem .8rem',
        display: 'flex', alignItems: 'center', gap: '.28rem',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
            animation: `helpbotBounce .9s ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Top Settlement issues in last 7 days',
  'Soundbox complaint trend last 30 days',
  'How many sessions escalated to agent yesterday?',
  'Which entity has the lowest bot resolution rate?',
];

// ── Main component ────────────────────────────────────────────────────────────

export default function HelpBot() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    try {
      const res = await axios.post(`${API_BASE}/helpbot/chat`, { message: userText, history });
      const d = res.data;
      setMessages(prev => [...prev, {
        role: 'assistant', type: d.type, content: d.message,
        sql: d.sql, columns: d.columns, rows: d.rows,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant', type: 'error',
        content: err.response?.data?.detail || 'Something went wrong. Please try again.',
        sql: null, columns: [], rows: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      <style>{`
        @keyframes helpbotBounce {
          0%,80%,100% { transform: translateY(0); }
          40%          { transform: translateY(-6px); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .helpbot-md p            { margin: 0 0 .4rem; }
        .helpbot-md p:last-child { margin-bottom: 0; }
        .helpbot-md ul, .helpbot-md ol { margin: .25rem 0 .25rem 1.2rem; padding: 0; }
        .helpbot-md li           { margin-bottom: .18rem; }
        .helpbot-md code         { background: #e2e8f0; padding: 1px 5px; border-radius: 3px; font-size: .76rem; }
        .helpbot-md strong       { font-weight: 600; }
        .helpbot-md h3           { font-size: .88rem; font-weight: 700; margin: .5rem 0 .25rem; }
      `}</style>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Open Help Bot"
        style={{
          position: 'fixed', bottom: '1.75rem', right: '1.75rem', zIndex: 1100,
          display: 'flex', alignItems: 'center', gap: '.45rem',
          background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 28,
          padding: '.6rem 1.1rem',
          fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(37,99,235,.4)',
          transition: 'background .15s, transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
        onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
      >
        <span style={{ fontSize: '1rem' }}>🤖</span> Help Bot
      </button>

      {/* Backdrop + Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(15,23,42,.4)', backdropFilter: 'blur(2px)',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          {/* Drawer — 50vw, full height */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '50vw', height: '100vh',
              background: '#fff',
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 40px rgba(0,0,0,.18)',
              animation: 'slideInRight .25s cubic-bezier(.4,0,.2,1)',
            }}
          >
            {/* ── Top bar ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '.75rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#fafafe', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#0f172a' }}>Help Bot</div>
                  <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>Ask anything — I'll query Trino and show results</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    style={{
                      fontSize: '.72rem', color: '#64748b', background: '#f1f5f9',
                      border: '1px solid #e2e8f0', borderRadius: 6,
                      padding: '3px 10px', cursor: 'pointer',
                    }}
                  >
                    Clear chat
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: '#f1f5f9', border: 'none', borderRadius: 8,
                    width: 32, height: 32, cursor: 'pointer',
                    fontSize: '1rem', color: '#64748b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            </div>

            {/* ── Messages area ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '.6rem' }}>👋</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', marginBottom: '.35rem' }}>
                    Hi! I'm your data assistant.
                  </div>
                  <div style={{ fontSize: '.84rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Ask me anything about your support data — I'll write and run the SQL for you.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', maxWidth: 420, margin: '0 auto' }}>
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        style={{
                          background: '#f8fafc', border: '1.5px solid #e2e8f0',
                          borderRadius: 10, padding: '.55rem 1rem',
                          fontSize: '.82rem', color: '#334155',
                          cursor: 'pointer', textAlign: 'left', lineHeight: 1.4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        💬 {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            {/* ── Input area ── */}
            <div style={{
              padding: '.85rem 1.25rem',
              borderTop: '1px solid #e2e8f0',
              background: '#fafafe', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your data…  (e.g. top issues last 7 days)"
                  rows={2}
                  disabled={loading}
                  style={{
                    flex: 1, resize: 'none',
                    border: '1.5px solid #e2e8f0', borderRadius: 10,
                    padding: '.55rem .8rem', fontSize: '.84rem',
                    color: '#334155', outline: 'none',
                    lineHeight: 1.5, fontFamily: 'inherit',
                    background: '#fff',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  style={{
                    padding: '.55rem .85rem', borderRadius: 10, border: 'none',
                    background: input.trim() && !loading ? '#2563eb' : '#e2e8f0',
                    color: input.trim() && !loading ? '#fff' : '#94a3b8',
                    cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
                    transition: 'background .15s',
                  }}
                >
                  ➤
                </button>
              </div>
              <div style={{ fontSize: '.67rem', color: '#94a3b8', marginTop: '.35rem', paddingLeft: '.2rem' }}>
                Enter to send · Shift+Enter for new line
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
