/**
 * CampaignDashboard
 * Pure display component – receives pre-fetched `detail` as a prop.
 */

import React, { useState, useMemo } from 'react';
import TranscriptModal from './TranscriptModal';
import IssueList from './IssueList';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

function fmtDur(sec) {
  if (!sec) return '0s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtNum(n) {
  return (n || 0).toLocaleString('en-IN');
}

const SESSION_PAGE_SIZE = 20;

const STATUS_STYLE = {
  USER_HANGED_UP: { bg: '#f1f5f9', color: '#475569' },
  INIT:           { bg: '#fef9c3', color: '#ca8a04' },
  PREINIT:        { bg: '#e0e7ff', color: '#4338ca' },
};

function SessionTable({ sessions }) {
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(0);
  const [playingId,   setPlayingId]   = useState(null);
  const [audioError,  setAudioError]  = useState(null);
  const [sessionModal, setSessionModal] = useState(null); // session_id for TranscriptModal

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      (s.session_id || '').toLowerCase().includes(q) ||
      (s.status     || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const totalPages = Math.ceil(filtered.length / SESSION_PAGE_SIZE);
  const pageRows   = filtered.slice(page * SESSION_PAGE_SIZE, (page + 1) * SESSION_PAGE_SIZE);

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Sessions ({filtered.length.toLocaleString()}{filtered.length !== sessions.length ? ` of ${sessions.length.toLocaleString()}` : ''})
        </div>
        <input
          type="text"
          placeholder="Search session ID or status…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            padding: '.35rem .75rem', borderRadius: 6, border: '1px solid #e2e8f0',
            fontSize: '.8rem', outline: 'none', width: 240,
          }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>#</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Session ID</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Start Time</th>
              <th style={{ textAlign: 'right', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Duration</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Disconnected By</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Recording</th>
              <th style={{ textAlign: 'left', padding: '.5rem .75rem', color: '#64748b', fontWeight: 600 }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s, i) => {
              const st = STATUS_STYLE[s.status] || { bg: '#f1f5f9', color: '#475569' };
              const rowNum = page * SESSION_PAGE_SIZE + i + 1;
              return (
                <tr key={s.session_id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '.45rem .75rem', color: '#94a3b8', fontSize: '.72rem' }}>{rowNum}</td>
                  <td style={{ padding: '.45rem .75rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#334155' }}>
                      {s.session_id || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '.45rem .75rem', color: '#64748b', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                    {s.start_time ? s.start_time.slice(0, 16) : '—'}
                  </td>
                  <td style={{ padding: '.45rem .75rem', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                    {fmtDur(s.duration)}
                  </td>
                  <td style={{ padding: '.45rem .75rem' }}>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 4, padding: '2px 8px', fontSize: '.72rem', fontWeight: 600 }}>
                      {(s.status || '—').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '.45rem .75rem', color: '#64748b', fontSize: '.78rem' }}>
                    {s.disconnection_source === 'far_end'  ? '👤 Customer' :
                     s.disconnection_source === 'near_end' ? '🤖 Bot'      : s.disconnection_source}
                  </td>
                  <td style={{ padding: '.45rem .75rem' }}>
                    {s.session_id && (
                      <button
                        onClick={() => setSessionModal(s.session_id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                          fontSize: '.72rem', fontWeight: 600, color: '#8b5cf6',
                          border: '1px solid #8b5cf6', borderRadius: 20,
                          padding: '2px 10px', background: 'none', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#8b5cf6'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8b5cf6'; }}
                      >
                        💬 View
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '.45rem .75rem' }}>
                    {(() => {
                      const getUrl = () => {
                        if (!s.session_id || !s.start_time) return null;
                        const [yyyy, mm, dd] = s.start_time.slice(0, 10).split('-');
                        const date = `${dd}-${mm}-${yyyy}`;
                        const gatewayUrl = `https://cst-gateway-int.paytm.com/recording/obd/${date}/${s.session_id}.wav`;
                        return `${API_BASE}/campaigns/recording?recording_url=${encodeURIComponent(gatewayUrl)}`;
                      };
                      const url = getUrl();
                      if (!url) return <span style={{ color: '#cbd5e1' }}>—</span>;
                      const isPlaying = playingId === s.session_id;

                      if (isPlaying) return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <audio
                            src={url}
                            controls
                            autoPlay
                            style={{ height: 28, width: 220 }}
                            onEnded={() => setPlayingId(null)}
                            onError={() => { setPlayingId(null); setAudioError(s.session_id); }}
                          />
                          <button onClick={() => setPlayingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: '#94a3b8' }}>✕</button>
                        </div>
                      );

                      if (audioError === s.session_id) return (
                        <span style={{ fontSize: '.72rem', color: '#ef4444' }}>⚠️ Not found</span>
                      );

                      return (
                        <button
                          onClick={() => { setPlayingId(s.session_id); setAudioError(null); }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                            fontSize: '.72rem', fontWeight: 600, color: '#6366f1',
                            border: '1px solid #6366f1', borderRadius: 20,
                            padding: '2px 10px', background: 'none', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6366f1'; }}
                        >
                          🎧 Listen
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '.75rem', fontSize: '.82rem' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '.3rem .75rem', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page === 0 ? 'not-allowed' : 'pointer', background: '#fff' }}
          >← Prev</button>
          <span style={{ color: '#64748b' }}>Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            style={{ padding: '.3rem .75rem', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', background: '#fff' }}
          >Next →</button>
        </div>
      )}

      {/* Session detail modal — reuses helpdesk TranscriptModal with session_id as ticket_id */}
      {sessionModal && (
        <TranscriptModal
          ticketId={sessionModal}
          helpdeskType="merchant"
          onClose={() => setSessionModal(null)}
        />
      )}
    </div>
  );
}

export default function CampaignDashboard({ detail }) {
  if (!detail) return null;

  if (detail.error) return (
    <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem 1rem', borderRadius: 8, fontSize: '.85rem', marginTop: '1rem' }}>
      ⚠️ {detail.error}
    </div>
  );

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="card-title">
        <span className="card-title-icon" style={{ background: '#e0e7ff' }}>📊</span>
        {detail.campaign}
        <span style={{ fontSize: '.75rem', fontWeight: 400, color: '#94a3b8', marginLeft: '.5rem' }}>
          {detail.since} → {detail.until}
        </span>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Calls',       value: fmtNum(detail.total_calls),       color: '#6366f1' },
          { label: 'Avg Duration',      value: fmtDur(detail.avg_duration),      color: '#8b5cf6' },
          { label: 'Answer Rate',       value: `${detail.answer_rate}%`,         color: detail.answer_rate >= 80 ? '#10b981' : '#f59e0b' },
          { label: 'Engagement (≥30s)', value: `${detail.engagement_rate}%`,     color: detail.engagement_rate >= 50 ? '#10b981' : '#f59e0b' },
          { label: 'Customer Hang-ups', value: fmtNum(detail.customer_hangups),  color: '#ef4444' },
          { label: 'Bot Hang-ups',      value: fmtNum(detail.bot_hangups),       color: '#64748b' },
        ].map((k) => (
          <div key={k.label} style={{
            flex: '1 1 130px', background: '#f8fafc', borderRadius: 10,
            padding: '.75rem 1rem', border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.25rem' }}>
              {k.label}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Duration buckets — horizontal bars */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.75rem' }}>
          Call Duration Breakdown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
          {detail.duration_buckets.map((b) => {
            const pct = detail.total_calls ? Math.round(b.count / detail.total_calls * 100) : 0;
            return (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <div style={{ width: 52, fontSize: '.72rem', fontWeight: 600, color: '#475569', textAlign: 'right', flexShrink: 0 }}>
                  {b.label}
                </div>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, minWidth: pct > 0 ? 4 : 0,
                    background: '#6366f1', borderRadius: 99, transition: 'width .4s ease',
                  }} />
                </div>
                <div style={{ width: 36, fontSize: '.72rem', fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>
                  {pct}%
                </div>
                <div style={{ width: 54, fontSize: '.68rem', color: '#94a3b8', flexShrink: 0 }}>
                  {fmtNum(b.count)}
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Issues & Customer Voice — from eval table joined on session_id = ticket_id */}
      {detail.top_issues?.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <IssueList issues={detail.top_issues} helpdeskType="merchant" showListenButton={true} />
        </div>
      )}

      {/* Session list */}
      {detail.sessions?.length > 0 && <SessionTable sessions={detail.sessions} />}
    </div>
  );
}
