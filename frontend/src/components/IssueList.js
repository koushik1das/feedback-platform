/**
 * IssueList – ranked list of issues with expandable Customer VoC.
 * Props:
 *   issues – array of IssueStats from InsightsResponse
 */

import React, { useState } from 'react';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
];

const RANK_BG = ['#fef9c3', '#f1f5f9', '#fef2f2'];

export default function IssueList({ issues }) {
  const [expanded, setExpanded] = useState(null);
  if (!issues?.length) return null;

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        <span className="card-title-icon" style={{ background: '#e0e7ff' }}>📋</span>
        Issues &amp; Customer Voice
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {issues.map((iss, idx) => {
          const isOpen = expanded === iss.label;
          const color  = COLORS[idx % COLORS.length];
          const rankBg = RANK_BG[idx] || '#f8fafc';

          return (
            <div
              key={iss.label}
              style={{
                borderBottom: '1px solid #f1f5f9',
                transition: 'background .15s',
              }}
            >
              {/* ── Row header (always visible) ── */}
              <div
                onClick={() => setExpanded(isOpen ? null : iss.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 0.5rem',
                  cursor: 'pointer',
                  borderLeft: `3px solid ${isOpen ? color : 'transparent'}`,
                  background: isOpen ? '#fafafe' : 'transparent',
                  transition: 'all .15s',
                }}
              >
                {/* Rank badge */}
                <div style={{
                  minWidth: 26, height: 26,
                  borderRadius: '50%',
                  background: idx < 3 ? rankBg : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.75rem', fontWeight: 700, color: '#475569',
                  flexShrink: 0,
                }}>
                  {idx + 1}
                </div>

                {/* Label + mini bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '.875rem', fontWeight: 600,
                    color: '#0f172a', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {iss.label}
                  </div>
                  <div style={{
                    marginTop: '0.3rem', height: 4,
                    background: '#f1f5f9', borderRadius: 99, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${iss.percentage}%`,
                      background: color,
                      borderRadius: 99,
                    }} />
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
                <div style={{
                  padding: '0 0.75rem 1rem 2.75rem',
                  animation: 'fadeIn .15s ease',
                }}>
                  {iss.example_comments?.length > 0 ? (
                    <>
                      <div style={{
                        fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '.06em', color: color, marginBottom: '.6rem',
                      }}>
                        Customer Voice
                      </div>
                      {iss.example_comments.map((comment, i) => (
                        <div key={i} style={{
                          background: '#f8fafc',
                          border: `1px solid #e2e8f0`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: '0 8px 8px 0',
                          padding: '.6rem .85rem',
                          marginBottom: '.5rem',
                          fontSize: '.82rem',
                          color: '#334155',
                          lineHeight: 1.5,
                        }}>
                          "{comment}"
                        </div>
                      ))}
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
  );
}
