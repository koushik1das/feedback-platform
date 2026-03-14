/**
 * EscalationStats
 * Shows the % of users who threatened social media escalation.
 * Props:
 *   threatPct   – float (e.g. 0.26)
 *   threatCount – int
 *   total       – int
 */

import React from 'react';

export default function EscalationStats({ threatPct, threatCount, total }) {
  const pct = threatPct ?? 0;
  const severity = pct >= 2 ? 'high' : pct >= 0.5 ? 'medium' : 'low';
  const colors = {
    high:   { bar: '#ef4444', badge: '#fef2f2', text: '#dc2626', label: 'High Risk' },
    medium: { bar: '#f59e0b', badge: '#fffbeb', text: '#d97706', label: 'Moderate'  },
    low:    { bar: '#10b981', badge: '#f0fdf4', text: '#059669', label: 'Low Risk'  },
  };
  const c = colors[severity];

  return (
    <div className="card">
      <div className="card-title">
        <div className="card-title-icon" style={{ background: '#fef2f2' }}>📢</div>
        Social Media Escalation Threat
      </div>

      {/* Big number */}
      <div style={{ textAlign: 'center', padding: '1.5rem 0 1rem' }}>
        <div style={{ fontSize: '3.5rem', fontWeight: 800, color: c.bar, lineHeight: 1 }}>
          {pct.toFixed(2)}%
        </div>
        <div style={{ marginTop: '.5rem', color: '#64748b', fontSize: '.9rem' }}>
          of interactions contained a social media threat
        </div>
        <span style={{
          display: 'inline-block',
          marginTop: '.75rem',
          padding: '.25rem .75rem',
          borderRadius: 99,
          background: c.badge,
          color: c.text,
          fontSize: '.8rem',
          fontWeight: 600,
        }}>
          {c.label}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ margin: '0 .5rem' }}>
        <div style={{
          height: 10,
          background: '#f1f5f9',
          borderRadius: 99,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(pct * 10, 100)}%`,
            background: c.bar,
            borderRadius: 99,
            transition: 'width .6s ease',
          }} />
        </div>
      </div>

      {/* Breakdown */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        marginTop: '1.5rem',
        padding: '1rem',
        background: '#f8fafc',
        borderRadius: 10,
        textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: c.bar }}>
            {(threatCount ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.2rem' }}>
            Threat mentions
          </div>
        </div>
        <div style={{ width: 1, background: '#e2e8f0' }} />
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#334155' }}>
            {((total ?? 0) - (threatCount ?? 0)).toLocaleString()}
          </div>
          <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.2rem' }}>
            No threat
          </div>
        </div>
        <div style={{ width: 1, background: '#e2e8f0' }} />
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#334155' }}>
            {(total ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.2rem' }}>
            Total analysed
          </div>
        </div>
      </div>
    </div>
  );
}
