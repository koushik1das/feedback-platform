/**
 * IssueList – ranked list of issues with expandable Customer VoC + Transcript CTA.
 * Props:
 *   issues – array of IssueStats from InsightsResponse
 */

import React, { useState, useCallback } from 'react';
import TranscriptModal from './TranscriptModal';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
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
  inquisitive: { label: 'Inquisitive', bg: '#e0e7ff', color: '#4338ca' },
  happy:       { label: 'Happy',       bg: '#d1fae5', color: '#065f46' },
  satisfied:   { label: 'Satisfied',   bg: '#d1fae5', color: '#065f46' },
};

export default function IssueList({ issues, helpdeskType = 'merchant', showListenButton = false }) {
  const [expanded,       setExpanded]       = useState(null);
  const [showAllMap,     setShowAllMap]     = useState({});
  const [showAllIssues,  setShowAllIssues]  = useState(true);
  const [transcriptId,   setTranscriptId]   = useState(null);
  const [playingKey,     setPlayingKey]     = useState(null);   // `${issueLabel}-${commentIdx}`
  const [audioError,     setAudioError]     = useState(null);

  const toggleShowAll = useCallback((label, e) => {
    e.stopPropagation();
    setShowAllMap((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const openTranscript = useCallback((ticketId, e) => {
    e.stopPropagation();
    setTranscriptId(ticketId);
  }, []);

  if (!issues?.length) return null;

  return (
    <>
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="card-title">
          <span className="card-title-icon" style={{ background: '#e0e7ff' }}>📋</span>
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
            const fnCallsList = iss.comment_function_calls  || [];

            return (
              <div
                key={iss.label}
                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }}
              >
                {/* ── Row header (always visible) ── */}
                <div
                  onClick={() => setExpanded(isOpen ? null : iss.label)}
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
                                    background: '#e0e7ff', color: '#4338ca',
                                    borderRadius: 4, padding: '2px 7px',
                                    letterSpacing: '.04em',
                                  }}>
                                    {langLabel}
                                  </span>
                                )}

                                {/* Date tag */}
                                {dateStr && (
                                  <span style={{
                                    fontSize: '.68rem', fontWeight: 500,
                                    background: '#f1f5f9', color: '#64748b',
                                    borderRadius: 4, padding: '2px 7px',
                                  }}>
                                    📅 {dateStr}
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
                                {ticketId && (
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

                                {/* Listen to recording (campaigns only) */}
                                {showListenButton && ticketId && dateStr && (() => {
                                  const playKey = `${iss.label}-${i}`;
                                  const isPlaying = playingKey === playKey;
                                  const hasError  = audioError === playKey;

                                  const [yyyy, mm, dd] = dateStr.split('-');
                                  const dateFmt = `${dd}-${mm}-${yyyy}`;
                                  const gatewayUrl = `https://cst-gateway-int.paytm.com/recording/obd/${dateFmt}/${ticketId}.wav`;
                                  const proxyUrl = `${API_BASE}/campaigns/recording?recording_url=${encodeURIComponent(gatewayUrl)}`;

                                  if (hasError) return (
                                    <span style={{ fontSize: '.68rem', color: '#ef4444' }}>⚠️ Not found</span>
                                  );

                                  if (isPlaying) return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                                      <audio
                                        src={proxyUrl}
                                        controls
                                        autoPlay
                                        style={{ height: 24, width: 180 }}
                                        onEnded={() => setPlayingKey(null)}
                                        onError={() => { setPlayingKey(null); setAudioError(playKey); }}
                                      />
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setPlayingKey(null); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.68rem', color: '#94a3b8' }}
                                      >✕</button>
                                    </div>
                                  );

                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setPlayingKey(playKey); setAudioError(null); }}
                                      style={{
                                        background: 'none', border: '1px solid #6366f1', borderRadius: 20,
                                        cursor: 'pointer', fontSize: '.68rem', fontWeight: 600, color: '#6366f1',
                                        padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                                        transition: 'background .15s, color .15s',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6366f1'; }}
                                    >
                                      🎧 Listen
                                    </button>
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
          onClose={() => setTranscriptId(null)}
        />
      )}
    </>
  );
}
