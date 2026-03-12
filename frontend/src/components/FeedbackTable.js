/**
 * FeedbackTable
 * Paginated raw-feed table showing the latest feedback items.
 * Props:
 *   items – array of FeedbackItem
 */

import React, { useState } from 'react';

const SOURCE_ICONS = {
  app_store_ios:   '🍎',
  google_play:     '🤖',
  twitter:         '🐦',
  facebook:        '📘',
  helpdesk_zendesk:'🎧',
  email_support:   '✉️',
  chatbot_platform:'💬',
};

const CHANNEL_COLORS = {
  app_store:    '#d1fae5',
  social_media: '#dbeafe',
  helpdesk:     '#fef9c3',
  email:        '#ede9fe',
  chatbot:      '#e0f2fe',
};

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

const PAGE_SIZE = 10;

export default function FeedbackTable({ items }) {
  const [page, setPage] = useState(0);
  if (!items?.length) return null;

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div className="card-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span className="card-title-icon" style={{ background: '#f0fdf4' }}>📋</span>
          Raw Feedback Feed
        </span>
        <span style={{ fontSize: '.8rem', fontWeight: 400, color: '#64748b' }}>
          {items.length} total items
        </span>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Channel</th>
              <th>Date</th>
              <th>Customer Feedback</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="source-chip">
                    {SOURCE_ICONS[item.source] || '📋'}
                    {item.source.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <span style={{
                    background: CHANNEL_COLORS[item.channel] || '#f1f5f9',
                    padding: '.15rem .5rem',
                    borderRadius: 20,
                    fontSize: '.75rem',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    {item.channel.replace('_', ' ')}
                  </span>
                </td>
                <td style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: '.8rem' }}>
                  {formatDate(item.timestamp)}
                </td>
                <td>
                  <div className="text-truncate" title={item.customer_text}>
                    {item.customer_text}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {item.rating != null ? (
                    <span style={{ fontWeight: 600, color: item.rating >= 4 ? '#10b981' : item.rating <= 2 ? '#ef4444' : '#f59e0b' }}>
                      {'★'.repeat(item.rating)}
                    </span>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem', fontSize: '.85rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '.35rem .8rem', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page === 0 ? 'not-allowed' : 'pointer', background: '#fff' }}
          >
            ← Prev
          </button>
          <span style={{ color: '#64748b' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            style={{ padding: '.35rem .8rem', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', background: '#fff' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
