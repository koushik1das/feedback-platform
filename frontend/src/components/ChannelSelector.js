/**
 * ChannelSelector
 * Renders a grid of selectable channel cards.
 * Props:
 *   channels       – array of channel metadata objects from the API
 *   selectedIds    – Set of currently selected channel IDs
 *   onToggle(id)   – callback when a card is clicked
 *   onAnalyse()    – callback when "Analyse" button is clicked
 *   loading        – bool, disables button while analysis is running
 */

import React from 'react';

const CHANNEL_ICONS = {
  app_store:    '⭐',
  social_media: '💬',
  helpdesk:     '🎧',
  email:        '✉️',
  chatbot:      '🤖',
};

const CHANNEL_COLORS = {
  app_store:    '#f0fdf4',
  social_media: '#eff6ff',
  helpdesk:     '#fefce8',
  email:        '#fdf4ff',
  chatbot:      '#f0f9ff',
};

export default function ChannelSelector({ channels, selectedIds, onToggle, onAnalyse, loading }) {
  const anySelected = selectedIds.size > 0;

  return (
    <div className="channel-section">
      <h2>Select Feedback Channels</h2>
      <p>Choose one or more channels to analyse. The system will fetch, aggregate, and surface top customer pain points.</p>

      <div className="channel-grid">
        {channels.map((ch) => {
          const isSelected = selectedIds.has(ch.id);
          return (
            <div
              key={ch.id}
              className={`channel-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggle(ch.id)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onToggle(ch.id)}
              style={{ borderColor: isSelected ? '#6366f1' : undefined }}
            >
              <div
                className={`channel-card-icon ${isSelected ? 'check-mark' : ''}`}
                style={{ background: CHANNEL_COLORS[ch.id] || '#f1f5f9' }}
              >
                {CHANNEL_ICONS[ch.id] || '📋'}
              </div>
              <div className="channel-card-name">{ch.name}</div>
              <div className="channel-card-desc">{ch.description}</div>
              <div className="channel-card-badge">
                {ch.sample_count} items
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="analyse-btn"
        onClick={onAnalyse}
        disabled={!anySelected || loading}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Analysing…
          </>
        ) : (
          <>
            <span>🔍</span>
            Analyse {selectedIds.size > 0 ? `(${selectedIds.size} channel${selectedIds.size > 1 ? 's' : ''})` : ''}
          </>
        )}
      </button>
    </div>
  );
}
