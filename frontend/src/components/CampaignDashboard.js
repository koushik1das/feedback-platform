/**
 * CampaignDashboard
 * Shows outbound campaign list and per-campaign drill-down analytics.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const DATE_RANGES = [
  { id: 'yesterday',            label: 'Yesterday' },
  { id: 'day_before_yesterday', label: 'Day Before Yesterday' },
  { id: 'last_7_days',          label: 'Last 7 Days' },
  { id: 'last_30_days',         label: 'Last 30 Days' },
];

function fmtDur(sec) {
  if (!sec) return '0s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtNum(n) {
  return (n || 0).toLocaleString('en-IN');
}

const CAMPAIGN_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#06b6d4',
];

const SESSION_PAGE_SIZE = 20;


const STATUS_STYLE = {
  USER_HANGED_UP: { bg: '#f1f5f9', color: '#475569' },
  INIT:           { bg: '#fef9c3', color: '#ca8a04' },
  PREINIT:        { bg: '#e0e7ff', color: '#4338ca' },
};

function SessionTable({ sessions }) {
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(0);
  const [playingId,  setPlayingId]  = useState(null);
  const [audioError, setAudioError] = useState(null);

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
    </div>
  );
}

export default function CampaignDashboard() {
  const [dateRange,    setDateRange]    = useState('last_7_days');
  const [campaigns,    setCampaigns]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [selected,     setSelected]     = useState(null);   // campaign name
  const [detail,       setDetail]       = useState(null);
  const [detailLoad,   setDetailLoad]   = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionPage,   setSessionPage]   = useState(0);

  const loadCampaigns = useCallback(async (dr) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    try {
      const res = await axios.get(`${API_BASE}/campaigns?date_range=${dr}`);
      setCampaigns(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(dateRange); }, [dateRange, loadCampaigns]);

  const openCampaign = useCallback(async (name) => {
    setSelected(name);
    setDetailLoad(true);
    setDetail(null);
    setSessionSearch('');
    setSessionPage(0);
    try {
      const res = await axios.get(
        `${API_BASE}/campaigns/analyse?campaign=${encodeURIComponent(name)}&date_range=${dateRange}`
      );
      setDetail(res.data);
    } catch (e) {
      setDetail({ error: e.response?.data?.detail || 'Failed to load analysis.' });
    } finally {
      setDetailLoad(false);
    }
  }, [dateRange]);

  return (
    <div style={{ padding: '1.5rem 0' }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
            📞 Outbound Campaigns
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#64748b' }}>
            AI voice bot call analytics · Merchant helpdesk
          </p>
        </div>
        {/* Date range selector */}
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.id}
              onClick={() => setDateRange(dr.id)}
              style={{
                padding: '.3rem .75rem', borderRadius: 20, border: '1px solid',
                borderColor: dateRange === dr.id ? '#6366f1' : '#e2e8f0',
                background:  dateRange === dr.id ? '#6366f1' : '#fff',
                color:       dateRange === dr.id ? '#fff'    : '#64748b',
                fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {dr.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, flex: '1 1 200px', borderRadius: 12 }} />
          ))}
        </div>
      )}

      {!loading && campaigns.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {campaigns.map((c, idx) => {
            const color   = CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length];
            const isOpen  = selected === c.name;
            return (
              <div
                key={c.name}
                onClick={() => openCampaign(c.name)}
                style={{
                  background: '#fff', borderRadius: 12, padding: '1rem 1.2rem',
                  border: `2px solid ${isOpen ? color : '#e2e8f0'}`,
                  cursor: 'pointer', transition: 'all .15s',
                  boxShadow: isOpen ? `0 4px 16px ${color}33` : '0 1px 4px rgba(0,0,0,.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.6rem' }}>
                  <div style={{
                    fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.05em', color, marginBottom: '.25rem',
                  }}>Campaign</div>
                  {isOpen && <span style={{ fontSize: '.7rem', background: color, color: '#fff', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>Selected</span>}
                </div>
                <div style={{ fontSize: '.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '.75rem', lineHeight: 1.3 }}>
                  {c.name}
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{fmtNum(c.total_calls)}</div>
                    <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>calls</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155' }}>{fmtDur(c.avg_duration)}</div>
                    <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>avg duration</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: c.answer_rate >= 80 ? '#10b981' : '#f59e0b' }}>
                      {c.answer_rate}%
                    </div>
                    <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>answered</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{ marginTop: '1.5rem' }}>
          {detailLoad && <div style={{ color: '#64748b', fontSize: '.9rem' }}>Loading analysis…</div>}

          {detail && !detail.error && (
            <div className="card">
              <div className="card-title">
                <span className="card-title-icon" style={{ background: '#e0e7ff' }}>📊</span>
                {detail.campaign}
                <span style={{ fontSize: '.75rem', fontWeight: 400, color: '#94a3b8', marginLeft: '.5rem' }}>
                  {detail.since} → {detail.until}
                </span>
              </div>

              {/* ── KPI row ── */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Total Calls',        value: fmtNum(detail.total_calls),    color: '#6366f1' },
                  { label: 'Avg Duration',        value: fmtDur(detail.avg_duration),   color: '#8b5cf6' },
                  { label: 'Answer Rate',         value: `${detail.answer_rate}%`,      color: detail.answer_rate >= 80 ? '#10b981' : '#f59e0b' },
                  { label: 'Engagement (≥30s)',   value: `${detail.engagement_rate}%`,  color: detail.engagement_rate >= 50 ? '#10b981' : '#f59e0b' },
                  { label: 'Customer Hang-ups',   value: fmtNum(detail.customer_hangups), color: '#ef4444' },
                  { label: 'Bot Hang-ups',        value: fmtNum(detail.bot_hangups),     color: '#64748b' },
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

              {/* ── Duration buckets ── */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
                  Call Duration Breakdown
                </div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {detail.duration_buckets.map((b) => {
                    const pct = detail.total_calls ? Math.round(b.count / detail.total_calls * 100) : 0;
                    return (
                      <div key={b.label} style={{ flex: '1 1 80px', textAlign: 'center' }}>
                        <div style={{
                          background: '#6366f1', borderRadius: 4,
                          height: Math.max(4, pct * 1.2),
                          marginBottom: '.3rem', transition: 'height .3s',
                        }} />
                        <div style={{ fontSize: '.68rem', color: '#475569', fontWeight: 600 }}>{b.label}</div>
                        <div style={{ fontSize: '.72rem', color: '#6366f1', fontWeight: 700 }}>{pct}%</div>
                        <div style={{ fontSize: '.65rem', color: '#94a3b8' }}>{fmtNum(b.count)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Daily trend ── */}
              {detail.daily_trend?.length > 1 && (
                <div>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.6rem' }}>
                    Daily Call Volume
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                          {['Date','Calls','Avg Duration'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '.4rem .6rem', color: '#64748b', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.daily_trend.map((d) => (
                          <tr key={d.date} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '.4rem .6rem', color: '#334155' }}>{d.date}</td>
                            <td style={{ padding: '.4rem .6rem', fontWeight: 600, color: '#6366f1' }}>{fmtNum(d.calls)}</td>
                            <td style={{ padding: '.4rem .6rem', color: '#475569' }}>{fmtDur(d.avg_duration)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* ── Session list ── */}
              {detail.sessions?.length > 0 && <SessionTable sessions={detail.sessions} />}
            </div>
          )}

          {detail?.error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '.75rem 1rem', borderRadius: 8, fontSize: '.85rem' }}>
              ⚠️ {detail.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
