/**
 * Centralised runtime configuration.
 *
 * REACT_APP_* variables are baked in at build time by react-scripts.
 * Set REACT_APP_API_BASE before `npm run build` for production, e.g.:
 *
 *   REACT_APP_API_BASE=http://your-domain:8081/api npm run build
 */

export const API_BASE =
  process.env.REACT_APP_API_BASE || 'http://localhost:8081/api';
