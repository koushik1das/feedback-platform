import React from 'react';
import { API_BASE } from '../config';

export default function Login({ error }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f1f5f9 0%, #dbeafe 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 4px 6px rgba(0,0,0,.07), 0 10px 30px rgba(0,0,0,.1)',
        padding: '3rem 2.5rem',
        width: '100%',
        maxWidth: 420,
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', margin: '0 auto 1.25rem',
          boxShadow: '0 4px 14px rgba(99,102,241,.35)',
        }}>
          💡
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '.25rem' }}>
          Voice of Customer
        </h1>
        <p style={{ fontSize: '.9rem', color: '#64748b', marginBottom: '2rem' }}>
          Customer Intelligence Platform
        </p>

        {/* Error message */}
        {error === 'unauthorized_domain' && (
          <div style={{
            background: '#fee2e2', color: '#dc2626', borderRadius: 10,
            padding: '.75rem 1rem', fontSize: '.85rem', marginBottom: '1.25rem',
          }}>
            Only <strong>@paytm.com</strong> and <strong>@paytmpayments.com</strong> accounts are allowed.
          </div>
        )}
        {error && error !== 'unauthorized_domain' && (
          <div style={{
            background: '#fee2e2', color: '#dc2626', borderRadius: 10,
            padding: '.75rem 1rem', fontSize: '.85rem', marginBottom: '1.25rem',
          }}>
            Sign-in failed. Please try again.
          </div>
        )}

        {/* Google Sign-In button */}
        <a
          href={`${API_BASE}/auth/google`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.75rem',
            padding: '.85rem 1.5rem',
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 12,
            fontSize: '.95rem', fontWeight: 600, color: '#0f172a',
            textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,.08)',
            transition: 'box-shadow .15s, border-color .15s',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          {/* Google logo SVG */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Sign in with Google
        </a>

        <p style={{ fontSize: '.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
          Access restricted to <strong>@paytm.com</strong> &amp; <strong>@paytmpayments.com</strong>
        </p>
      </div>
    </div>
  );
}
