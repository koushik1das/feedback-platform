/**
 * ChannelSelector
 * Step 1 – channel (App Store | Help Desk)
 * Step 2 – helpdesk type (Merchant | Customer)
 * Step 3 – Merchant: product pill  |  Customer: category pill
 * Step 4 – Customer only: sub-category (cst_entity) pill
 */

import React from 'react';

const CHANNELS = [
  { id: 'app_store',  name: 'App Store',          icon: '⭐', description: 'Google Play reviews & ratings',            color: '#f0fdf4' },
  { id: 'helpdesk',   name: 'Help Desk',           icon: '🎧', description: 'Customer & merchant support interactions', color: '#fefce8' },
  { id: 'campaigns',  name: 'Outbound Campaign',   icon: '📞', description: 'AI voice bot call analytics',             color: '#ede9fe' },
];

const APP_STORE_APPS = [
  { id: 'net.one97.paytm',    label: 'Paytm',              icon: '💳', description: 'Main consumer app' },
  { id: 'com.paytm.business', label: 'Paytm for Business', icon: '🏪', description: 'Merchant / B2B app' },
  { id: 'com.phonepe.app',    label: 'PhonePe',            icon: '📱', description: 'Competitor benchmark' },
];

const HELPDESK_TYPES = [
  { id: 'merchant', label: 'Merchant', icon: '🏪', description: 'B2B merchant support' },
  { id: 'customer', label: 'Customer', icon: '👤', description: 'End-customer support' },
];

const MERCHANT_PRODUCTS = [
  { id: 'loan',                label: 'Loan',                  icon: '🏦' },
  { id: 'payments_settlement', label: 'Payments & Settlement', icon: '💳' },
  { id: 'soundbox',            label: 'Soundbox',              icon: '🔊' },
  { id: 'profile',             label: 'Profile',               icon: '👤' },
  { id: 'card_machine',        label: 'Card Machine',          icon: '💳' },
  { id: 'wealth',              label: 'Wealth',                icon: '💎' },
];

const DATE_RANGES = [
  { id: 'yesterday',            label: 'Yesterday',              icon: '📅' },
  { id: 'day_before_yesterday', label: 'Day Before Yesterday',   icon: '📆' },
  { id: 'last_7_days',          label: 'Last 7 Days',            icon: '🗓️' },
  { id: 'last_30_days',         label: 'Last 30 Days',           icon: '📊' },
];

// Customer category → sub-category (cst_entity) map
const CUSTOMER_CATEGORIES = [
  {
    id: 'travel', label: 'Travel', icon: '✈️',
    subcategories: [
      { id: 'bus',    label: 'Bus',    icon: '🚌' },
      { id: 'flight', label: 'Flight', icon: '✈️' },
      { id: 'train',  label: 'Train',  icon: '🚆' },
    ],
  },
  {
    id: 'investments', label: 'Investments', icon: '💰',
    subcategories: [
      { id: 'gold', label: 'Gold', icon: '🥇' },
      { id: 'pspl', label: 'PSPL', icon: '📈' },
    ],
  },
  {
    id: 'ondc', label: 'ONDC', icon: '🛒',
    subcategories: [
      { id: 'ondc-commerce', label: 'ONDC Commerce', icon: '🛒' },
    ],
  },
  {
    id: 'personal_loan', label: 'Personal Loan', icon: '🏧',
    subcategories: [
      { id: 'personalloan', label: 'Personal Loan', icon: '🏧' },
    ],
  },
  {
    id: 'profile', label: 'Profile', icon: '👤',
    subcategories: [
      { id: 'paytm-profile', label: 'Paytm Profile', icon: '👤' },
    ],
  },
  {
    id: 'upi', label: 'UPI', icon: '📱',
    subcategories: [
      { id: 'upi-ocl', label: 'UPI OCL', icon: '📱' },
    ],
  },
  {
    id: 'recharge_utilities', label: 'Recharge & Utilities', icon: '⚡',
    subcategories: [
      { id: 'ccbp',                  label: 'CCBP',                  icon: '⚡' },
      { id: 'challan',               label: 'Challan',               icon: '📄' },
      { id: 'citybus',               label: 'City Bus',              icon: '🚌' },
      { id: 'creditcard',            label: 'Credit Card',           icon: '💳' },
      { id: 'cylinder',              label: 'Cylinder',              icon: '🔵' },
      { id: 'digital-subscriptions', label: 'Digital Subscriptions', icon: '📺' },
      { id: 'dth',                   label: 'DTH',                   icon: '📡' },
      { id: 'electricity',           label: 'Electricity',           icon: '💡' },
      { id: 'fastag',                label: 'FASTag',                icon: '🚗' },
      { id: 'gas',                   label: 'Gas',                   icon: '🔥' },
      { id: 'insurance',             label: 'Insurance',             icon: '🛡️' },
      { id: 'landline',              label: 'Landline',              icon: '☎️' },
      { id: 'loan',                  label: 'Loan',                  icon: '🏦' },
      { id: 'metro',                 label: 'Metro',                 icon: '🚇' },
      { id: 'mobilepostpaid',        label: 'Mobile Postpaid',       icon: '📶' },
      { id: 'mobileprepaid',         label: 'Mobile Prepaid',        icon: '📱' },
      { id: 'mortgage',              label: 'Mortgage',              icon: '🏠' },
      { id: 'municipal',             label: 'Municipal',             icon: '🏛️' },
      { id: 'ru_education',          label: 'Education',             icon: '🎓' },
      { id: 'ru_insurance',          label: 'RU Insurance',          icon: '🛡️' },
      { id: 'voucher',               label: 'Voucher',               icon: '🎟️' },
      { id: 'water',                 label: 'Water',                 icon: '💧' },
      { id: 'apartment',             label: 'Apartment',             icon: '🏢' },
      { id: 'cabletv',               label: 'Cable TV',              icon: '📺' },
      { id: 'creditline',            label: 'Credit Line',           icon: '💳' },
      { id: 'datacard',              label: 'Data Card',             icon: '📶' },
      { id: 'donation',              label: 'Donation',              icon: '❤️' },
      { id: 'entertainment',         label: 'Entertainment',         icon: '🎬' },
      { id: 'gprc',                  label: 'GPRC',                  icon: '📋' },
      { id: 'loanagainstmutualfund', label: 'Loan vs Mutual Fund',   icon: '📊' },
      { id: 'paytmdeals',            label: 'Paytm Deals',           icon: '🏷️' },
      { id: 'postpaid',              label: 'Postpaid',              icon: '📶' },
      { id: 'recharge',              label: 'Recharge',              icon: '🔋' },
      { id: 'rent',                  label: 'Rent',                  icon: '🔑' },
      { id: 'retailinsurance',       label: 'Retail Insurance',      icon: '🛡️' },
      { id: 'toll',                  label: 'Toll',                  icon: '🛣️' },
    ],
  },
];

export default function ChannelSelector({
  selectedChannel,
  appStoreApp,
  helpdeskType,
  helpdeskCategory,
  helpdeskProduct,
  dateRange,
  campaigns,
  campaignsLoading,
  selectedCampaign,
  onSelectChannel,
  onSelectAppStoreApp,
  onSelectHelpdeskType,
  onSelectHelpdeskCategory,
  onSelectProduct,
  onSelectDateRange,
  onSelectCampaign,
  onAnalyse,
  loading,
}) {
  const selectedCategoryDef = CUSTOMER_CATEGORIES.find(c => c.id === helpdeskCategory);

  const canAnalyse =
    (selectedChannel === 'campaigns' && selectedCampaign !== null) ||
    (selectedChannel === 'app_store' && appStoreApp !== null) ||
    (selectedChannel === 'helpdesk' &&
      helpdeskType === 'merchant' && helpdeskProduct !== null) ||
    (selectedChannel === 'helpdesk' &&
      helpdeskType === 'customer' && helpdeskCategory !== null && helpdeskProduct !== null);

  // Label for Analyse button
  let analyseLabel = '';
  if (selectedChannel === 'campaigns' && selectedCampaign) {
    analyseLabel = ` · ${selectedCampaign}`;
  } else if (selectedChannel === 'app_store' && appStoreApp) {
    const app = APP_STORE_APPS.find(a => a.id === appStoreApp);
    analyseLabel = ` · ${app?.label || appStoreApp}`;
  } else if (selectedChannel === 'helpdesk' && helpdeskType === 'merchant' && helpdeskProduct) {
    const p = MERCHANT_PRODUCTS.find(x => x.id === helpdeskProduct);
    analyseLabel = ` · Merchant — ${p?.label || helpdeskProduct}`;
  } else if (selectedChannel === 'helpdesk' && helpdeskType === 'customer' && helpdeskProduct) {
    const sub = selectedCategoryDef?.subcategories.find(x => x.id === helpdeskProduct);
    analyseLabel = ` · ${selectedCategoryDef?.label} — ${sub?.label || helpdeskProduct}`;
  }

  return (
    <div className="channel-section">
      <h2>Select Feedback Channel</h2>
      <p>Choose a channel to analyse. The platform will surface top customer pain points.</p>

      {/* ── Step 1: Channel ── */}
      <div className="channel-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 280px))' }}>
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
              <div className={`channel-card-icon ${isSelected ? 'check-mark' : ''}`} style={{ background: ch.color }}>
                {ch.icon}
              </div>
              <div className="channel-card-name">{ch.name}</div>
              <div className="channel-card-desc">{ch.description}</div>
            </div>
          );
        })}
      </div>

      {/* ── Step 2 (App Store): App selection ── */}
      {selectedChannel === 'app_store' && (
        <div className="product-selector">
          <p className="product-selector-label">Select App</p>
          <div className="product-pills">
            {APP_STORE_APPS.map((app) => (
              <button
                key={app.id}
                className={`product-pill ${appStoreApp === app.id ? 'active' : ''}`}
                onClick={() => onSelectAppStoreApp(app.id)}
                title={app.description}
              >
                <span>{app.icon}</span>{app.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Campaign pills ── */}
      {selectedChannel === 'campaigns' && (
        <div className="product-selector">
          <p className="product-selector-label" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span>🗓️</span> Date Range
          </p>
          <div className="product-pills">
            {DATE_RANGES.map((dr) => (
              <button
                key={dr.id}
                className={`product-pill ${dateRange === dr.id ? 'active' : ''}`}
                onClick={() => onSelectDateRange(dr.id)}
              >
                <span>{dr.icon}</span>{dr.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedChannel === 'campaigns' && (
        <div className="product-selector">
          <p className="product-selector-label">Select Campaign</p>
          {campaignsLoading && (
            <div style={{ fontSize: '.82rem', color: '#64748b', padding: '.5rem 0' }}>Loading campaigns…</div>
          )}
          {!campaignsLoading && campaigns.length === 0 && (
            <div style={{ fontSize: '.82rem', color: '#94a3b8', padding: '.5rem 0' }}>No campaigns found for selected date range.</div>
          )}
          <div className="product-pills" style={{ flexWrap: 'wrap' }}>
            {campaigns.map((c) => (
              <button
                key={c.name}
                className={`product-pill ${selectedCampaign === c.name ? 'active' : ''}`}
                onClick={() => onSelectCampaign(c.name)}
              >
                📞 {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Date range picker (helpdesk only) ── */}
      {selectedChannel === 'helpdesk' && (
        <div className="product-selector">
          <p className="product-selector-label" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span>🗓️</span> Date Range
          </p>
          <div className="product-pills">
            {DATE_RANGES.map((dr) => (
              <button
                key={dr.id}
                className={`product-pill ${dateRange === dr.id ? 'active' : ''}`}
                onClick={() => onSelectDateRange(dr.id)}
              >
                <span>{dr.icon}</span>{dr.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Helpdesk type ── */}
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
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3a: Merchant product ── */}
      {selectedChannel === 'helpdesk' && helpdeskType === 'merchant' && (
        <div className="product-selector">
          <p className="product-selector-label">Select Product</p>
          <div className="product-pills">
            {MERCHANT_PRODUCTS.map((p) => (
              <button
                key={p.id}
                className={`product-pill ${helpdeskProduct === p.id ? 'active' : ''}`}
                onClick={() => onSelectProduct(p.id)}
              >
                <span>{p.icon}</span>{p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3b: Customer category ── */}
      {selectedChannel === 'helpdesk' && helpdeskType === 'customer' && (
        <div className="product-selector">
          <p className="product-selector-label">Select Category</p>
          <div className="product-pills" style={{ flexWrap: 'wrap' }}>
            {CUSTOMER_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`product-pill ${helpdeskCategory === cat.id ? 'active' : ''}`}
                onClick={() => onSelectHelpdeskCategory(cat.id)}
              >
                <span>{cat.icon}</span>{cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 4: Customer sub-category ── */}
      {selectedChannel === 'helpdesk' && helpdeskType === 'customer' && helpdeskCategory && (
        <div className="product-selector">
          <p className="product-selector-label">Select Sub-category</p>
          <div className="product-pills" style={{ flexWrap: 'wrap' }}>
            {selectedCategoryDef?.subcategories.map((s) => (
              <button
                key={s.id}
                className={`product-pill ${helpdeskProduct === s.id ? 'active' : ''}`}
                onClick={() => onSelectProduct(s.id)}
              >
                <span>{s.icon}</span>{s.label}
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
          <><span className="spinner" />Analysing…</>
        ) : (
          <><span>🔍</span>Analyse{analyseLabel}</>
        )}
      </button>
    </div>
  );
}
