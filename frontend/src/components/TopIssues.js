/**
 * TopIssues
 * Bar chart + ranked list of the most common complaint categories.
 * Props:
 *   issues – array of IssueStats from InsightsResponse
 */

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.1)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{d.label}</div>
      <div style={{ fontSize: 13, color: '#475569' }}>
        <b>{d.count}</b> complaints &nbsp;·&nbsp; <b>{d.percentage}%</b>
      </div>
    </div>
  );
};

export default function TopIssues({ issues }) {
  if (!issues?.length) return null;

  const chartData = issues.slice(0, 7).map((iss) => ({
    label: iss.label.replace(' Issues', '').replace(' & ', ' / '),
    count: iss.count,
    percentage: iss.percentage,
    fullLabel: iss.label,
  }));

  return (
    <div className="card" style={{ height: '100%' }}>
      <div className="card-title">
        <span className="card-title-icon" style={{ background: '#e0e7ff' }}>📊</span>
        Top Issues by Frequency
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category" dataKey="label"
            tick={{ fontSize: 11, fill: '#475569' }}
            width={130} axisLine={false} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
            <LabelList
              dataKey="percentage"
              position="right"
              formatter={(v) => `${v}%`}
              style={{ fontSize: 11, fontWeight: 600, fill: '#6366f1' }}
            />
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Ranked list below chart */}
      <div style={{ marginTop: '1rem' }}>
        {issues.slice(0, 5).map((iss, i) => (
          <div className="issue-row" key={iss.label}>
            <div className={`issue-rank rank-${i + 1}`}>{i + 1}</div>
            <div className="issue-info">
              <div className="issue-label">{iss.label}</div>
              <div className="issue-bar-wrap">
                <div
                  className="issue-bar"
                  style={{
                    width: `${iss.percentage}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
            <div>
              <div className="issue-pct">{iss.percentage}%</div>
              <div className="issue-count">{iss.count} items</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
