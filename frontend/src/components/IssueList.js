/**
 * IssueList – ranked list of issues with expandable Customer VoC + Transcript CTA.
 * Props:
 *   issues – array of IssueStats from InsightsResponse
 */

import React, { useState, useCallback } from 'react';
import axios from 'axios';
import TranscriptModal from './TranscriptModal';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const COLORS = [
  '#2563eb', '#3b82f6', '#ec4899',
  '#f59e0b', '#10b981', '#0ea5e9', '#ef4444',
];

const RANK_BG = ['#fef9c3', '#f1f5f9', '#fef2f2'];

const INITIAL_COMMENTS = 5;
const INITIAL_ISSUES   = 5;

const LANG_LABELS = { hi:'HI', en:'EN', mr:'MR', ta:'TA', te:'TE', kn:'KN', bn:'BN', gu:'GU', pa:'PA', ml:'ML' };

const TONE_META = {
  frustrated:  { label: 'Frustrated',  bg: '#fee2e2', color: '#dc2626' },
  angry:       { label: 'Angry',       bg: '#fce7f3', color: '#be185d' },
  confused:    { label: 'Confused',    bg: '#fef9c3', color: '#ca8a04' },
  neutral:     { label: 'Neutral',     bg: '#f1f5f9', color: '#475569' },
  inquisitive: { label: 'Inquisitive', bg: '#dbeafe', color: '#1d4ed8' },
  happy:       { label: 'Happy',       bg: '#d1fae5', color: '#065f46' },
  satisfied:   { label: 'Satisfied',   bg: '#d1fae5', color: '#065f46' },
};

export default function IssueList({ issues, helpdeskType = 'merchant', showListenButton = false, recordingPath = 'obd', showTranscript = true }) {
  const [expanded,       setExpanded]       = useState(null);
  const [showAllMap,     setShowAllMap]     = useState({});
  const [showAllIssues,  setShowAllIssues]  = useState(true);
  const [transcriptId,   setTranscriptId]   = useState(null);
  const [playingKey,     setPlayingKey]     = useState(null);
  const [audioError,     setAudioError]     = useState(null);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [summaries,      setSummaries]      = useState({});  // { [label]: { loading, data, error } }

  const toggleShowAll = useCallback((label, e) => {
    e.stopPropagation();
    setShowAllMap((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const openTranscript = useCallback((ticketId, e) => {
    e.stopPropagation();
    setTranscriptId(ticketId);
  }, []);

  const handleExpand = useCallback((label, comments) => {
    setExpanded(prev => {
      const opening = prev !== label;
      if (opening && comments?.length && !summaries[label]) {
        setSummaries(s => ({ ...s, [label]: { loading: true, data: null, error: null } }));
        axios.post(`${API_BASE}/summarise-issue`, { label, comments })
          .then(res => setSummaries(s => ({ ...s, [label]: { loading: false, data: res.data, error: null } })))
          .catch(() => setSummaries(s => ({ ...s, [label]: { loading: false, data: null, error: 'Summary unavailable' } })));
      }
      return opening ? label : null;
    });
  }, [summaries]);

  if (!issues?.length) return null;

  return (
    <>
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="card-title">
          <span className="card-title-icon" style={{ background: '#dbeafe' }}>📋</span>
          Issues &amp; Customer Voice
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {(showAllIssues ? issues : issues.slice(0, INITIAL_ISSUES)).map((iss, idx) => {
            const isOpen = expanded === iss.label;
            const color  = COLORS[idx % COLORS.length];
            const rankBg = RANK_BG[idx] || '#f8fafc';
            const ticketIds   = iss.comment_ticket_ids     || [];
            const tones       = iss.comment_tones           || [];
            const langs       = iss.comment_langs           || [];
            const dates       = iss.comment_dates           || [];
            const ratings     = iss.comment_ratings         || [];
            const fnCallsList  = iss.comment_function_calls  || [];
            const durations    = iss.comment_durations        || [];

            return (
              <div
                key={iss.label}
                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }}
              >
                {/* ── Row header (always visible) ── */}
                <div
                  onClick={() => handleExpand(iss.label, iss.example_comments)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 0.5rem', cursor: 'pointer',
                    borderLeft: `3px solid ${isOpen ? color : 'transparent'}`,
                    background: isOpen ? '#fafafe' : 'transparent',
                    transition: 'all .15s',
                  }}
                >
                  {/* Rank badge */}
                  <div style={{
                    minWidth: 26, height: 26, borderRadius: '50%',
                    background: idx < 3 ? rankBg : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.75rem', fontWeight: 700, color: '#475569', flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>

                  {/* Label + mini bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '.875rem', fontWeight: 600, color: '#0f172a',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {iss.label}
                    </div>
                    <div style={{ marginTop: '0.3rem', height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${iss.percentage}%`, background: color, borderRadius: 99 }} />
                    </div>
                  </div>

                  {/* Pct + count */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '.875rem', fontWeight: 700, color }}>{iss.percentage}%</div>
                    <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>{iss.count.toLocaleString()} items</div>
                  </div>

                  {/* Chevron */}
                  <span style={{
                    fontSize: '.8rem', color: '#94a3b8', flexShrink: 0,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform .2s',
                  }}>▾</span>
                </div>

                {/* ── Expanded VoC section ── */}
                {isOpen && (
                  <div style={{ padding: '0 0.75rem 1rem 2.75rem', animation: 'fadeIn .15s ease' }}>
                    {iss.example_comments?.length > 0 ? (
                      <>
                        <div style={{
                          fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '.06em', color, marginBottom: '.6rem',
                        }}>
                          Customer Voice
                        </div>

                        {/* ── AI Summary ── */}
                        {(() => {
                          const s = summaries[iss.label];
                          if (!s) return null;
                          if (s.loading) return (
                            <div style={{
                              background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                              border: '1px solid #bfdbfe', borderRadius: 10,
                              padding: '.75rem 1rem', marginBottom: '.85rem',
                              display: 'flex', alignItems: 'center', gap: '.5rem',
                              fontSize: '.78rem', color: '#2563eb',
                            }}>
                              <div style={{ width: 14, height: 14, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                              Generating AI summary…
                            </div>
                          );
                          if (s.error) return null;
                          if (!s.data) return null;
                          const { summary, pain_points, suggestions } = s.data;
                          return (
                            <div style={{
                              background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)',
                              border: '1px solid #bfdbfe', borderRadius: 10,
                              padding: '.85rem 1rem', marginBottom: '.85rem',
                              fontSize: '.8rem', lineHeight: 1.55,
                            }}>
                              {/* Header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.55rem' }}>
                                <span style={{ fontSize: '.95rem' }}>✨</span>
                                <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>AI Summary</span>
                              </div>
                              {/* Overview */}
                              <p style={{ margin: '0 0 .6rem', color: '#334155' }}>{summary}</p>
                              {/* Pain points */}
                              {pain_points?.length > 0 && (
                                <div style={{ marginBottom: '.5rem' }}>
                                  <div style={{ fontWeight: 600, color: '#dc2626', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.3rem' }}>🔴 Key Pain Points</div>
                                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                                    {pain_points.map((p, pi) => (
                                      <li key={pi} style={{ color: '#475569', marginBottom: '.2rem' }}>{p}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {/* Suggestions */}
                              {suggestions?.length > 0 && (
                                <div>
                                  <div style={{ fontWeight: 600, color: '#059669', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.3rem' }}>🛠️ Product Improvements</div>
                                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                                    {suggestions.map((sg, si) => (
                                      <li key={si} style={{ color: '#475569', marginBottom: '.2rem' }}>{sg}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {(showAllMap[iss.label]
                          ? iss.example_comments
                          : iss.example_comments.slice(0, INITIAL_COMMENTS)
                        ).map((comment, i) => {
                          const ticketId  = ticketIds[i] || null;
                          const tone      = (tones[i] || '').toLowerCase();
                          const lang      = (langs[i] || '').toLowerCase();
                          const toneMeta  = TONE_META[tone] || null;
                          const langLabel = LANG_LABELS[lang] || (lang ? lang.toUpperCase() : null);
                          const dateStr   = dates[i] || null;
                          const rating    = ratings[i] != null ? ratings[i] : null;
                          const fnCalls   = fnCallsList[i] || [];
                          const duration  = durations[i] != null ? durations[i] : null;

                          return (
                            <div key={i} style={{ marginBottom: '.75rem' }}>
                              {/* Comment bubble */}
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderLeft: `3px solid ${color}`,
                                borderRadius: '0 8px 8px 0',
                                padding: '.6rem .85rem',
                                fontSize: '.82rem', color: '#334155', lineHeight: 1.5,
                              }}>
                                "{comment}"
                              </div>

                              {/* Tags row */}
                              <div style={{
                                display: 'flex', alignItems: 'center',
                                gap: '.4rem', marginTop: '.35rem', flexWrap: 'wrap',
                              }}>
                                {/* Language tag */}
                                {langLabel && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 700,
                                    background: '#dbeafe', color: '#1d4ed8',
                                    borderRadius: 4, padding: '2px 7px',
                                    letterSpacing: '.04em',
                                  }}>
                                    {langLabel}
                                  </span>
                                )}

                                {/* Date + Time tags */}
                                {dateStr && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 500,
                                    background: '#f1f5f9', color: '#64748b',
                                    borderRadius: 4, padding: '2px 7px',
                                  }}>
                                    📅 {dateStr.slice(0, 10)}
                                  </span>
                                )}
                                {dateStr && dateStr.length > 10 && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 500,
                                    background: '#f1f5f9', color: '#64748b',
                                    borderRadius: 4, padding: '2px 7px',
                                  }}>
                                    🕐 {dateStr.slice(11, 16)}
                                  </span>
                                )}

                                {/* Rating tag */}
                                {rating != null && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 700,
                                    background: rating >= 4 ? '#d1fae5' : rating <= 2 ? '#fee2e2' : '#fef9c3',
                                    color:      rating >= 4 ? '#065f46' : rating <= 2 ? '#dc2626' : '#ca8a04',
                                    borderRadius: 4, padding: '2px 7px',
                                  }}>
                                    {'★'.repeat(Math.round(rating))} {rating}/5
                                  </span>
                                )}

                                {/* Customer feedback / tone tag */}
                                {toneMeta && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 600,
                                    background: toneMeta.bg, color: toneMeta.color,
                                    borderRadius: 4, padding: '2px 8px',
                                  }}>
                                    {toneMeta.label}
                                  </span>
                                )}

                                {/* Function call tags */}
                                {fnCalls.map((fn) => (
                                  <span key={fn} style={{
                                    fontSize: '.68rem', fontWeight: 700,
                                    background: '#dbeafe', color: '#1e40af',
                                    borderRadius: 4, padding: '2px 8px',
                                    fontFamily: 'monospace', letterSpacing: '.02em',
                                  }}>
                                    ⚙️ {fn}
                                  </span>
                                ))}

                                {/* View Transcript CTA */}
                                {showTranscript && ticketId && (
                                  <button
                                    onClick={(e) => openTranscript(ticketId, e)}
                                    style={{
                                      background: 'none',
                                      border: `1px solid ${color}`,
                                      borderRadius: 20,
                                      cursor: 'pointer',
                                      fontSize: '.68rem',
                                      fontWeight: 600,
                                      color,
                                      padding: '2px 10px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '.25rem',
                                      transition: 'background .15s, color .15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = color; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = color; }}
                                  >
                                    💬 View Transcript
                                  </button>
                                )}

                                {/* Listen + Download */}
                                {showListenButton && ticketId && dateStr && (() => {
                                  const playKey    = `${iss.label}-${i}`;
                                  const isPlaying  = playingKey === playKey;
                                  const hasError   = audioError === playKey;
                                  const isDling    = downloadingKey === playKey;

                                  const dateOnly = dateStr.slice(0, 10);
                                  const [yyyy, mm, dd] = dateOnly.split('-');
                                  const dateFmt  = `${dd}-${mm}-${yyyy}`;
                                  const gatewayUrl = recordingPath === 'ivr'
                                    ? `https://cst-gateway-int.paytm.com/recording/${dateFmt}/${ticketId}.wav`
                                    : `https://cst-gateway-int.paytm.com/recording/obd/${dateFmt}/${ticketId}.wav`;
                                  const proxyUrl = `${API_BASE}/campaigns/recording?recording_url=${encodeURIComponent(gatewayUrl)}`;

                                  async function handleDownload(e) {
                                    e.stopPropagation();
                                    setDownloadingKey(playKey);
                                    try {
                                      const res  = await fetch(proxyUrl);
                                      if (!res.ok) throw new Error();
                                      const blob = await res.blob();
                                      const url  = URL.createObjectURL(blob);
                                      const a    = document.createElement('a');
                                      a.href = url; a.download = `${ticketId}.wav`;
                                      document.body.appendChild(a); a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                    } catch {
                                      alert('Recording not found or unavailable.');
                                    } finally {
                                      setDownloadingKey(null);
                                    }
                                  }

                                  const btnBase = {
                                    borderRadius: 20, cursor: 'pointer', fontSize: '.68rem',
                                    fontWeight: 600, padding: '2px 10px',
                                    display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                                  };
                                  const downloadBtn = (
                                    <button
                                      key="dl"
                                      onClick={handleDownload}
                                      disabled={isDling}
                                      style={{
                                        ...btnBase,
                                        background: 'none', border: '1px solid #64748b',
                                        color: '#64748b', opacity: isDling ? .6 : 1,
                                        cursor: isDling ? 'wait' : 'pointer',
                                      }}
                                      onMouseEnter={(e) => { if (!isDling) { e.currentTarget.style.background = '#64748b'; e.currentTarget.style.color = '#fff'; }}}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b'; }}
                                    >
                                      {isDling ? '…' : '↓ Download'}
                                    </button>
                                  );

                                  if (hasError) return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                                      <span style={{ fontSize: '.68rem', color: '#ef4444' }}>⚠️ Not found</span>
                                      {downloadBtn}
                                    </div>
                                  );

                                  return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                                      {isPlaying ? (
                                        <>
                                          <audio
                                            src={proxyUrl} controls autoPlay
                                            style={{ height: 24, width: 160 }}
                                            onEnded={() => setPlayingKey(null)}
                                            onError={() => { setPlayingKey(null); setAudioError(playKey); }}
                                          />
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setPlayingKey(null); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.68rem', color: '#94a3b8' }}
                                          >✕</button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setPlayingKey(playKey); setAudioError(null); }}
                                          style={{ ...btnBase, background: 'none', border: '1px solid #2563eb', color: '#2563eb' }}
                                          onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.color = '#fff'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#2563eb'; }}
                                        >
                                          🎧 Listen
                                        </button>
                                      )}
                                      {downloadBtn}
                                      {duration != null && duration > 0 && (
                                        <span style={{
                                          fontSize: '.68rem', fontWeight: 500,
                                          background: '#f1f5f9', color: '#64748b',
                                          borderRadius: 4, padding: '2px 7px',
                                        }}>
                                          ⏱ {duration < 60 ? `${duration}s` : `${Math.floor(duration/60)}m${duration%60 ? ` ${duration%60}s` : ''}`}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}

                        {iss.example_comments.length > INITIAL_COMMENTS && (
                          <button
                            onClick={(e) => toggleShowAll(iss.label, e)}
                            style={{
                              marginTop: '.25rem', background: 'none', border: 'none',
                              cursor: 'pointer', fontSize: '.8rem', fontWeight: 600,
                              color, padding: '0',
                              display: 'flex', alignItems: 'center', gap: '.25rem',
                            }}
                          >
                            {showAllMap[iss.label]
                              ? '▲ View less'
                              : `▼ View ${iss.example_comments.length - INITIAL_COMMENTS} more`}
                          </button>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '.82rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No sample quotes available for this issue.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Transcript modal ── */}
      {transcriptId && (
        <TranscriptModal
          ticketId={transcriptId}
          helpdeskType={helpdeskType}
          showEval={!showListenButton}
          recordingPath={showListenButton ? recordingPath : null}
          onClose={() => setTranscriptId(null)}
        />
      )}
    </>
  );
}
