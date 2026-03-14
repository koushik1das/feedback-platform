/**
 * ChannelSelector
 * Shows only App Store and Helpdesk.
 * When Helpdesk is selected a product sub-selector appears (Loan / Payments / Settlement).
 *
 * Props:
 *   selectedChannel    – "app_store" | "helpdesk" | null
 *   helpdeskProduct    – "loan" | "payments" | "settlement" | null
 *   onSelectChannel(id)
 *   onSelectProduct(p)
 *   onAnalyse()
 *   loading
 */

import React from 'react';

const CHANNELS = [
  {
    id:          'app_store',
    name:        'App Store',
    icon:        '⭐',
    description: 'Google Play reviews & ratings',
    color:       '#f0fdf4',
  },
  {
    id:          'helpdesk',
    name:        'Help Desk',
    icon:        '🎧',
    description: 'Customer support interactions',
    color:       '#fefce8',
  },
];

const PRODUCTS = [
  { id: 'loan',                label: 'Loan',                   icon: '🏦' },
  { id: 'payments_settlement', label: 'Payments & Settlement',  icon: '💳' },
];

export default function ChannelSelector({
  selectedChannel,
  helpdeskProduct,
  onSelectChannel,
  onSelectProduct,
  onAnalyse,
  loading,
}) {
  const canAnalyse =
    selectedChannel === 'app_store' ||
    (selectedChannel === 'helpdesk' && helpdeskProduct !== null);

  return (
    <div className="channel-section">
      <h2>Select Feedback Channel</h2>
      <p>Choose a channel to analyse. The platform will surface top customer pain points.</p>

      {/* ── Channel cards ── */}
      <div className="channel-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(200px, 280px))' }}>
        {CHANNELS.map((ch) => {
          const isSelected = selectedChannel === ch.id;
          return (
            <div
              key={ch.id}
              className={`channel-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectChannel(ch.id)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectChannel(ch.id)}
              style={{ borderColor: isSelected ? '#6366f1' : undefined }}
            >
              <div
                className={`channel-card-icon ${isSelected ? 'check-mark' : ''}`}
                style={{ background: ch.color }}
              >
                {ch.icon}
              </div>
              <div className="channel-card-name">{ch.name}</div>
              <div className="channel-card-desc">{ch.description}</div>
            </div>
          );
        })}
      </div>

      {/* ── Helpdesk product sub-selector ── */}
      {selectedChannel === 'helpdesk' && (
        <div className="product-selector">
          <p className="product-selector-label">Select Product</p>
          <div className="product-pills">
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                className={`product-pill ${helpdeskProduct === p.id ? 'active' : ''}`}
                onClick={() => onSelectProduct(p.id)}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Analyse button ── */}
      <button
        className="analyse-btn"
        onClick={onAnalyse}
        disabled={!canAnalyse || loading}
        style={{ marginTop: '1.5rem' }}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Analysing…
          </>
        ) : (
          <>
            <span>🔍</span>
            Analyse
            {selectedChannel === 'helpdesk' && helpdeskProduct
              ? ` · ${PRODUCTS.find((p) => p.id === helpdeskProduct)?.label}`
              : selectedChannel === 'app_store'
              ? ' · App Store'
              : ''}
          </>
        )}
      </button>
    </div>
  );
}
