/**
 * ChannelSelector
 * Step 1 – pick channel (App Store | Help Desk)
 * Step 2 – if Helpdesk: pick type (Merchant | Customer)
 * Step 3 – pick product based on type
 *
 * Props:
 *   selectedChannel         – "app_store" | "helpdesk" | null
 *   helpdeskType            – "merchant" | "customer" | null
 *   helpdeskProduct         – product slug | null
 *   onSelectChannel(id)
 *   onSelectHelpdeskType(t)
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
    description: 'Customer & merchant support interactions',
    color:       '#fefce8',
  },
];

const HELPDESK_TYPES = [
  { id: 'merchant', label: 'Merchant', icon: '🏪', description: 'B2B merchant support' },
  { id: 'customer', label: 'Customer', icon: '👤', description: 'End-customer support' },
];

const MERCHANT_PRODUCTS = [
  { id: 'loan',                label: 'Loan',                  icon: '🏦' },
  { id: 'payments_settlement', label: 'Payments & Settlement', icon: '💳' },
  { id: 'soundbox',            label: 'Soundbox',              icon: '🔊' },
];

const CUSTOMER_PRODUCTS = [
  { id: 'train',  label: 'Train',  icon: '🚆' },
  { id: 'bus',    label: 'Bus',    icon: '🚌' },
  { id: 'flight', label: 'Flight', icon: '✈️' },
];

export default function ChannelSelector({
  selectedChannel,
  helpdeskType,
  helpdeskProduct,
  onSelectChannel,
  onSelectHelpdeskType,
  onSelectProduct,
  onAnalyse,
  loading,
}) {
  const products = helpdeskType === 'merchant'
    ? MERCHANT_PRODUCTS
    : helpdeskType === 'customer'
    ? CUSTOMER_PRODUCTS
    : [];

  const canAnalyse =
    selectedChannel === 'app_store' ||
    (selectedChannel === 'helpdesk' && helpdeskType !== null && helpdeskProduct !== null);

  const selectedProductLabel = products.find(p => p.id === helpdeskProduct)?.label;

  return (
    <div className="channel-section">
      <h2>Select Feedback Channel</h2>
      <p>Choose a channel to analyse. The platform will surface top customer pain points.</p>

      {/* ── Step 1: Channel cards ── */}
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

      {/* ── Step 2: Helpdesk type (Merchant / Customer) ── */}
      {selectedChannel === 'helpdesk' && (
        <div className="product-selector">
          <p className="product-selector-label">Select Helpdesk Type</p>
          <div className="product-pills">
            {HELPDESK_TYPES.map((t) => (
              <button
                key={t.id}
                className={`product-pill ${helpdeskType === t.id ? 'active' : ''}`}
                onClick={() => onSelectHelpdeskType(t.id)}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Product sub-selector ── */}
      {selectedChannel === 'helpdesk' && helpdeskType !== null && (
        <div className="product-selector">
          <p className="product-selector-label">
            Select {helpdeskType === 'merchant' ? 'Product' : 'Category'}
          </p>
          <div className="product-pills">
            {products.map((p) => (
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
            {selectedChannel === 'helpdesk' && helpdeskType && selectedProductLabel
              ? ` · ${HELPDESK_TYPES.find(t => t.id === helpdeskType)?.label} — ${selectedProductLabel}`
              : selectedChannel === 'app_store'
              ? ' · App Store'
              : ''}
          </>
        )}
      </button>
    </div>
  );
}
