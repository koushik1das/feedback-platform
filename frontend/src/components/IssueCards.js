/**
 * IssueCards
 * Expandable cards showing details + example comments for each issue cluster.
 * Props:
 *   issues – array of IssueStats
 */

import React, { useState } from 'react';

const SENT_BADGE = {
  negative: 'badge badge-negative',
  neutral:  'badge badge-neutral',
  positive: 'badge badge-positive',
};

const SENT_LABEL = {
  negative: 'Negative',
  neutral:  'Mixed',
  positive: 'Positive',
};

const COLORS = [
  '#2563eb', '#3b82f6', '#ec4899',
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
];

export default function IssueCards({ issues }) {
  const [expanded, setExpanded] = useState(null);
  if (!issues?.length) return null;

  return (
    <div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
        Issue Details &amp; Customer Voice
      </h3>
      <div className="issue-cards-grid">
        {issues.map((iss, idx) => {
          const isOpen = expanded === iss.label;
          const color = COLORS[idx % COLORS.length];
          const sentClass = SENT_BADGE[iss.sentiment_label] || 'badge badge-neutral';

          return (
            <div className="issue-card" key={iss.label}>
              <div
                className="issue-card-header"
                style={{ cursor: 'pointer', borderLeft: `4px solid ${color}` }}
                onClick={() => setExpanded(isOpen ? null : iss.label)}
              >
                <div>
                  <div className="issue-card-title">{iss.label}</div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: '.15rem' }}>
                    {iss.count} complaints · {iss.percentage}% of total
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span className={sentClass}>{SENT_LABEL[iss.sentiment_label]}</span>
                  <span style={{ fontSize: '1rem', color: '#94a3b8', transition: 'transform .2s', display: 'block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                </div>
              </div>

              {isOpen && (
                <div className="issue-card-body">
                  {/* Channel breakdown */}
                  <div className="issue-card-meta">
                    {Object.entries(iss.channels).map(([ch, cnt]) => (
                      <div key={ch}>
                        <strong>{cnt}</strong> from {ch.replace('_', ' ')}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '.75rem', fontSize: '.82rem' }}>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '.15rem' }}>Avg Sentiment Score</div>
                      <div style={{
                        fontWeight: 700,
                        color: iss.avg_sentiment < -0.1 ? '#ef4444'
                              : iss.avg_sentiment > 0.1 ? '#10b981'
                              : '#f59e0b',
                      }}>
                        {iss.avg_sentiment.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '.15rem' }}>Share of all issues</div>
                      <div style={{ fontWeight: 700, color: color }}>{iss.percentage}%</div>
                    </div>
                  </div>

                  {/* Channel pills */}
                  <div className="channel-pills">
                    {Object.keys(iss.channels).map((ch) => (
                      <span className="channel-pill" key={ch}>{ch.replace('_', ' ')}</span>
                    ))}
                  </div>

                  {/* Example comments */}
                  {iss.example_comments?.length > 0 && (
                    <div style={{ marginTop: '.85rem' }}>
                      <div className="comments-label">Customer Voices</div>
                      {iss.example_comments.map((comment, i) => (
                        <div className="comment-bubble" key={i}>
                          "{comment}"
                        </div>
                      ))}
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
