/**
 * SentimentChart
 * Donut (pie) chart showing positive / neutral / negative breakdown.
 * Props:
 *   distribution – SentimentDistribution from InsightsResponse
 */

import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const SENT_COLORS = {
  Positive: '#10b981',
  Neutral:  '#f59e0b',
  Negative: '#ef4444',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '8px 12px',
    }}>
      <span style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</span>
      {': '}{d.value} ({d.payload.pct}%)
    </div>
  );
};

export default function SentimentChart({ distribution }) {
  if (!distribution) return null;

  const { positive, neutral, negative, total } = distribution;
  const pct = (v) => total > 0 ? Math.round(v / total * 100) : 0;

  const data = [
    { name: 'Positive', value: positive, pct: pct(positive) },
    { name: 'Neutral',  value: neutral,  pct: pct(neutral) },
    { name: 'Negative', value: negative, pct: pct(negative) },
  ].filter((d) => d.value > 0);

  const dominantSentiment = data.reduce((a, b) => (a.value > b.value ? a : b), data[0]);

  return (
    <div className="card" style={{ height: '100%' }}>
      <div className="card-title">
        <span className="card-title-icon" style={{ background: '#d1fae5' }}>💡</span>
        Sentiment Distribution
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={55} outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={SENT_COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ flex: 1 }}>
          {/* Centre label */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', fontWeight: 600 }}>
              Overall Sentiment
            </div>
            <div style={{
              fontSize: '1.5rem', fontWeight: 700,
              color: SENT_COLORS[dominantSentiment?.name] || '#64748b',
            }}>
              {dominantSentiment?.name || '—'}
            </div>
            <div style={{ fontSize: '.8rem', color: '#64748b' }}>
              {dominantSentiment?.pct}% of feedback
            </div>
          </div>

          <div className="sentiment-legend">
            {data.map((entry) => (
              <div className="legend-item" key={entry.name}>
                <div className="legend-dot" style={{ background: SENT_COLORS[entry.name] }} />
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
                <span style={{ color: '#475569', marginLeft: 'auto', fontSize: '.82rem' }}>
                  {entry.value} ({entry.pct}%)
                </span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '1rem', padding: '.75rem', background: '#f8fafc',
            borderRadius: 8, fontSize: '.82rem', color: '#475569',
          }}>
            <strong>{total}</strong> total feedback items analysed
          </div>
        </div>
      </div>
    </div>
  );
}
