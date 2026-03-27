/**
 * TranscriptModal — full-screen side drawer
 * Left panel  : Chat transcript
 * Right panel : Master data accordion (sections load on click)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SessionTimeline from './SessionTimeline';
import { API_BASE } from '../config';

// ── helpers ──────────────────────────────────────────────────────────────────

function roleMeta(role) {
  if (role === 'user')      return { label: 'Merchant', bg: '#2563eb', color: '#fff',    isUser: true  };
  if (role === 'assistant') return { label: 'Bot',      bg: '#f1f5f9', color: '#0f172a', isUser: false };
  return                           { label: 'System',   bg: '#fef9c3', color: '#78350f', isUser: false };
}

const LANG_LABELS = { hi:'HI', en:'EN', mr:'MR', ta:'TA', te:'TE', kn:'KN', bn:'BN', gu:'GU', pa:'PA', ml:'ML' };

function LangTag({ lang }) {
  if (!lang) return null;
  return (
    <span style={{ fontSize:'.6rem', fontWeight:700, background:'#dbeafe', color:'#1d4ed8',
      borderRadius:3, padding:'1px 4px', letterSpacing:'.04em' }}>
      {LANG_LABELS[lang.toLowerCase()] || lang.toUpperCase()}
    </span>
  );
}

function fmt(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
  catch { return ''; }
}

/**
 * Split bot message into alternating text and tool-call segments.
 * Finds all top-level JSON objects {...} embedded in the text.
 * Returns [{type:'text'|'tool', content:string}]
 */
function splitBotContent(text) {
  if (!text) return [{ type: 'text', content: '' }];
  const result = [];
  let i = 0, textStart = 0;

  while (i < text.length) {
    if (text[i] === '{') {
      // Walk forward to find matching closing brace
      let depth = 0, j = i;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') { depth--; if (depth === 0) break; }
      }
      if (depth === 0) {
        const candidate = text.slice(i, j + 1);
        try {
          JSON.parse(candidate);
          // Valid JSON — flush preceding text then push tool segment
          const preceding = text.slice(textStart, i).trim();
          if (preceding) result.push({ type: 'text', content: preceding });
          result.push({ type: 'tool', content: candidate });
          textStart = j + 1;
          i = j + 1;
          continue;
        } catch { /* not valid JSON, skip */ }
      }
    }
    i++;
  }
  const tail = text.slice(textStart).trim();
  if (tail) result.push({ type: 'text', content: tail });
  return result.length ? result : [{ type: 'text', content: text }];
}

function InlineToolCall({ content }) {
  const [open, setOpen] = useState(false);
  let parsed = null;
  let label = 'Tool';
  try {
    parsed = JSON.parse(content);
    label = parsed?.name || parsed?.type || parsed?.function_name || 'Tool';
  } catch { label = 'Tool'; }

  return (
    <div style={{ marginTop: '.5rem', border: '1px solid #e0e7ff', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: '#eef2ff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '.4rem',
          padding: '.3rem .65rem', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '.67rem', color: '#94a3b8', flexShrink: 0 }}>⚙️</span>
        <span style={{
          fontSize: '.67rem', fontWeight: 700, fontFamily: 'monospace',
          color: '#4338ca', background: '#e0e7ff', borderRadius: 3,
          padding: '1px 6px', flexShrink: 0,
        }}>{label}</span>
        <span style={{ fontSize: '.67rem', color: '#94a3b8', flex: 1 }}>tool call · {open ? 'hide' : 'show'}</span>
        <span style={{ fontSize: '.68rem', color: '#94a3b8',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>
      {open && (
        <pre style={{
          margin: 0, padding: '.55rem .75rem',
          background: '#f5f3ff', fontSize: '.71rem', color: '#3730a3',
          lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderTop: '1px solid #e0e7ff', maxHeight: 260, overflowY: 'auto',
        }}>
          {parsed ? JSON.stringify(parsed, null, 2) : content}
        </pre>
      )}
    </div>
  );
}

function isToolMsg(content) {
  if (!content) return false;
  const t = content.trim();
  return t.startsWith('{') || t.startsWith('[{');
}

// ── Object-dump detector + parser (Java/Kotlin toString format) ───────────────

function isObjectDump(content) {
  if (!content) return false;
  return /^[\w][\w.]*\(/.test(content.trim());
}

function _splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function _parseVal(str) {
  str = str.trim();
  if (str === 'null') return null;
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
  // ClassName(...) nested object
  const cm = str.match(/^[\w.]+\(([\s\S]*)\)$/);
  if (cm) return _parseKV(cm[1]);
  // {k=v} map
  if (str.startsWith('{') && str.endsWith('}')) return _parseKV(str.slice(1, -1));
  return str;
}

function _parseKV(inner) {
  const obj = {};
  for (const pair of _splitTopLevel(inner)) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    if (key) obj[key] = _parseVal(val);
  }
  return obj;
}

function parseObjectDump(content) {
  const t = content.trim();
  const cm = t.match(/^([\w.]+)\(([\s\S]*)\)$/);
  if (!cm) return null;
  const obj = _parseKV(cm[2]);
  return obj;
}

function ObjectDumpMessage({ content, bubbleStyle }) {
  const [open, setOpen] = useState(false);
  let jsonStr = content;
  try {
    const parsed = parseObjectDump(content);
    if (parsed) jsonStr = JSON.stringify(parsed, null, 2);
  } catch { jsonStr = content; }

  return (
    <div style={{ width: '100%' }}>
      {!open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{ whiteSpace: 'pre-wrap', opacity: 0.75, fontSize: '.78rem' }}>
            {content.slice(0, 60)}{content.length > 60 ? '…' : ''}
          </span>
          <button
            onClick={() => setOpen(true)}
            style={{
              flexShrink: 0, background: 'rgba(255,255,255,0.25)',
              border: '1px solid rgba(255,255,255,0.5)', borderRadius: 20,
              color: 'inherit', cursor: 'pointer', fontSize: '.72rem',
              fontWeight: 700, padding: '2px 10px', whiteSpace: 'nowrap',
            }}
          >
            {'{ } View JSON'}
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 20, color: 'inherit', cursor: 'pointer',
              fontSize: '.72rem', fontWeight: 700, padding: '2px 10px',
              marginBottom: '.5rem',
            }}
          >
            ▲ Collapse
          </button>
          <pre style={{
            margin: 0, fontSize: '.72rem', lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            background: 'rgba(0,0,0,0.15)', borderRadius: 6,
            padding: '.5rem .65rem', maxHeight: 300, overflowY: 'auto',
          }}>
            {jsonStr}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolMessage({ content, time }) {
  const [open, setOpen] = useState(false);
  let parsed = null;
  let label = 'Tool';
  try {
    parsed = JSON.parse(content.trim());
    label = parsed?.name || parsed?.type || parsed?.function_name || 'Tool';
  } catch { label = 'Tool'; }

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
      <div style={{ fontSize: '.65rem', color: '#94a3b8', marginBottom: '.2rem' }}>
        ⚙️ Tool · {time}
      </div>
      <div style={{ border: '1px solid #e0e7ff', borderRadius: '8px 8px 8px 2px', overflow: 'hidden' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: '100%', background: '#eef2ff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '.4rem',
            padding: '.3rem .65rem', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: '.67rem', fontWeight: 700, fontFamily: 'monospace',
            color: '#4338ca', background: '#e0e7ff', borderRadius: 3,
            padding: '1px 6px', flexShrink: 0,
          }}>{label}</span>
          <span style={{ fontSize: '.67rem', color: '#94a3b8', flex: 1 }}>{open ? 'hide' : 'show payload'}</span>
          <span style={{ fontSize: '.68rem', color: '#94a3b8',
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </button>
        {open && (
          <pre style={{
            margin: 0, padding: '.55rem .75rem',
            background: '#f5f3ff', fontSize: '.71rem', color: '#3730a3',
            lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            borderTop: '1px solid #e0e7ff', maxHeight: 260, overflowY: 'auto',
          }}>
            {parsed ? JSON.stringify(parsed, null, 2) : content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Listen button (IVR / Soundbox / Outbound recording) ──────────────────────

function ListenButton({ ticketId, createdAt, recordingPath }) {
  const [playing,      setPlaying]      = useState(false);
  const [audioError,   setAudioError]   = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [available,    setAvailable]    = useState(null); // null=checking, true, false

  useEffect(() => {
    if (!ticketId || !createdAt || !recordingPath) { setAvailable(false); return; }
    const dateOnly = createdAt.slice(0, 10);
    const [yyyy, mm, dd] = dateOnly.split('-');
    const dateFmt  = `${dd}-${mm}-${yyyy}`;
    const gatewayUrl = recordingPath === 'ivr'
      ? `https://cst-gateway-int.paytm.com/recording/${dateFmt}/${ticketId}.wav`
      : `https://cst-gateway-int.paytm.com/recording/obd/${dateFmt}/${ticketId}.wav`;
    axios.get(`${API_BASE}/campaigns/check-recording?recording_url=${encodeURIComponent(gatewayUrl)}`)
      .then(res => setAvailable(res.data?.available === true))
      .catch(() => setAvailable(false));
  }, [ticketId, createdAt, recordingPath]);

  // Still checking or not available — render nothing
  if (!available) return null;

  const dateOnly = createdAt.slice(0, 10);
  const [yyyy, mm, dd] = dateOnly.split('-');
  const dateFmt  = `${dd}-${mm}-${yyyy}`;
  const gatewayUrl = recordingPath === 'ivr'
    ? `https://cst-gateway-int.paytm.com/recording/${dateFmt}/${ticketId}.wav`
    : `https://cst-gateway-int.paytm.com/recording/obd/${dateFmt}/${ticketId}.wav`;
  const proxyUrl = `${API_BASE}/campaigns/recording?recording_url=${encodeURIComponent(gatewayUrl)}`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const res  = await fetch(proxyUrl);
      if (!res.ok) throw new Error('Not found');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${ticketId}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Recording not found or unavailable.');
    } finally {
      setDownloading(false);
    }
  }

  // Shared Download button — always visible
  const DownloadBtn = (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
        borderRadius: 20, padding: '4px 12px', cursor: downloading ? 'wait' : 'pointer',
        fontSize: '.75rem', fontWeight: 600, opacity: downloading ? .6 : 1,
      }}
    >
      {downloading ? '…' : '↓ Download'}
    </button>
  );

  if (audioError) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: '.72rem', color: '#ef4444' }}>⚠️ Not found</span>
      {DownloadBtn}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Audio player (shown when playing, else Listen button) */}
      {playing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <audio
            src={proxyUrl}
            controls
            autoPlay
            style={{ height: 28, width: 200 }}
            onEnded={() => setPlaying(false)}
            onError={() => { setPlaying(false); setAudioError(true); }}
          />
          <button
            onClick={() => setPlaying(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '.75rem', color: '#94a3b8' }}
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setPlaying(true); setAudioError(false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
            borderRadius: 20, padding: '4px 12px', cursor: 'pointer',
            fontSize: '.75rem', fontWeight: 600,
          }}
        >
          ▶ Listen
        </button>
      )}
      {DownloadBtn}
    </div>
  );
}

function Spinner({ size = 24, color = '#2563eb' }) {
  return (
    <div style={{ width:size, height:size, border:`3px solid #e2e8f0`,
      borderTopColor: color, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
  );
}

// ── Data renderer (recursive key-value) ──────────────────────────────────────

function DataValue({ val }) {
  if (val === null || val === undefined) return <span style={{ color:'#94a3b8' }}>—</span>;
  if (typeof val === 'boolean') return <span style={{ color: val ? '#10b981' : '#ef4444', fontWeight:600 }}>{val ? 'Yes' : 'No'}</span>;
  if (typeof val !== 'object') return <span style={{ color:'#0f172a' }}>{String(val)}</span>;

  if (Array.isArray(val)) {
    if (val.length === 0) return <span style={{ color:'#94a3b8' }}>Empty</span>;
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'.5rem', marginTop:'.25rem' }}>
        {val.map((item, i) => (
          <div key={i} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'.6rem .8rem' }}>
            {typeof item === 'object' ? <DataTable obj={item} /> : <span style={{ fontSize:'.82rem' }}>{String(item)}</span>}
          </div>
        ))}
      </div>
    );
  }

  return <DataTable obj={val} />;
}

function DataTable({ obj }) {
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entries.length) return <span style={{ color:'#94a3b8' }}>No data</span>;
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.8rem' }}>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding:'4px 8px 4px 0', color:'#64748b', fontWeight:500,
              verticalAlign:'top', whiteSpace:'nowrap', width:'40%',
              borderBottom:'1px solid #f1f5f9' }}>
              {k.replace(/_/g,' ')}
            </td>
            <td style={{ padding:'4px 0 4px 8px', verticalAlign:'top',
              borderBottom:'1px solid #f1f5f9', wordBreak:'break-word' }}>
              <DataValue val={v} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function AccordionSection({ section }) {
  const [open, setOpen] = useState(false);

  const dataEntries = Object.entries(section.data);
  const preview = dataEntries.slice(0, 2).map(([k]) => k.replace(/_/g,' ')).join(', ');

  return (
    <div style={{ borderBottom:'1px solid #f1f5f9' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:'100%', background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:'.6rem',
          padding:'.75rem 1rem', textAlign:'left',
          transition:'background .12s',
        }}
        onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background='none'}
      >
        <span style={{ fontSize:'1rem', flexShrink:0 }}>{section.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'.85rem', fontWeight:600, color:'#0f172a' }}>{section.title}</div>
          {!open && (
            <div style={{ fontSize:'.72rem', color:'#94a3b8', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>
              {preview}…
            </div>
          )}
        </div>
        <span style={{ fontSize:'.75rem', color:'#94a3b8', flexShrink:0,
          transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>▾</span>
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding:'.25rem 1rem 1rem 2.6rem', animation:'fadeIn .15s ease' }}>
          {dataEntries.map(([k, v]) => (
            <div key={k} style={{ marginBottom:'.75rem' }}>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'.05em', color:'#94a3b8', marginBottom:'.3rem' }}>
                {k.replace(/_/g,' ')}
              </div>
              <div style={{ fontSize:'.82rem', color:'#334155' }}>
                <DataValue val={v} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Eval Score Ring ───────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const pct   = Math.round((score || 0) * 100);
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const r = 28, circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
      <svg width={72} height={72} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#f1f5f9" strokeWidth={7} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ transform:'none' }}>
        <div style={{ fontSize:'1.6rem', fontWeight:800, color, lineHeight:1 }}>{pct}%</div>
        <div style={{ fontSize:'.72rem', color:'#64748b', marginTop:2 }}>Overall Score</div>
      </div>
    </div>
  );
}

// Plain-English summaries
function buildEvalSummary(items, positive) {
  if (!items.length) return null;
  const labels = items.map(i => i.label.toLowerCase());
  if (positive) {
    if (labels.length === 1) return `The bot performed well on ${labels[0]}.`;
    const last = labels[labels.length - 1];
    const rest = labels.slice(0, -1).join(', ');
    return `The bot handled this conversation well — it showed strong ${rest}, and ${last} throughout the interaction.`;
  } else {
    if (labels.length === 1) return `The bot struggled with ${labels[0]} in this conversation.`;
    const last = labels[labels.length - 1];
    const rest = labels.slice(0, -1).join(', ');
    return `This conversation had some gaps — the bot fell short on ${rest}, and ${last} needs improvement.`;
  }
}

// Per-metric improvement suggestions
const IMPROVEMENT_TIPS = {
  empathy_score:             'Train the bot to acknowledge merchant frustration explicitly before offering solutions. Use phrases like "I understand this is frustrating" to build rapport.',
  resolution_achieved:       'Review the conversation flow to identify where resolution broke down. Ensure the bot confirms resolution before closing the session.',
  response_relevance_score:  'Improve intent detection accuracy. The bot may be matching to the wrong intent — review utterance training data for similar queries.',
  customer_satisfaction:     'Add a brief satisfaction check at the end of the conversation. If sentiment is low, escalate to a human agent proactively.',
  user_sentiment_end:        'The merchant left the conversation unhappy. Consider adding a follow-up touchpoint or proactive outreach after low-satisfaction sessions.',
  sentiment_net_change:      'The bot failed to improve merchant mood during the conversation. Review tone and response style — solutions should be framed positively.',
  handoff_needed:            'The bot required human escalation. Analyse the escalation trigger and consider adding a self-serve flow to handle this scenario.',
  social_media_threat:       'This session showed social media escalation risk. Flag these sessions for priority human review and proactive merchant outreach.',
  agent_response_repetition: 'The bot repeated similar responses. Diversify response templates and add contextual memory to avoid looping on the same message.',
  unanswered_question_count: 'Some merchant questions were left unanswered. Review the conversation to identify missing intents and add them to the training set.',
};

function buildImprovementSuggestions(wentWrong) {
  return wentWrong
    .filter(item => IMPROVEMENT_TIPS[item.key])
    .map(item => ({ label: item.label, tip: IMPROVEMENT_TIPS[item.key] }));
}

// Metrics table component
function MetricsTable({ items, accentColor, borderColor, bgColor, textColor, subColor }) {
  if (!items.length) return (
    <div style={{ fontSize:'.78rem', color:'#94a3b8', fontStyle:'italic' }}>None</div>
  );
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
      <thead>
        <tr style={{ background: bgColor }}>
          <th style={{ padding:'.35rem .6rem', textAlign:'left', fontWeight:700,
            color: textColor, borderBottom:`1px solid ${borderColor}` }}>Metric</th>
          <th style={{ padding:'.35rem .6rem', textAlign:'right', fontWeight:700,
            color: textColor, borderBottom:`1px solid ${borderColor}`, whiteSpace:'nowrap' }}>Score</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={item.key} style={{ background: i % 2 === 0 ? bgColor : 'transparent' }}>
            <td style={{ padding:'.35rem .6rem', color: textColor, fontWeight:500,
              borderBottom:`1px solid ${borderColor}` }}>
              {item.label}
              {item.note && (
                <div style={{ fontSize:'.65rem', color: subColor, marginTop:1 }}>{item.note}</div>
              )}
            </td>
            <td style={{ padding:'.35rem .6rem', textAlign:'right', fontWeight:700,
              color: accentColor, borderBottom:`1px solid ${borderColor}`, whiteSpace:'nowrap' }}>
              {Math.round(item.value * 100)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EvalSection({ evalData, loading, error }) {
  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'2rem' }}>
      <Spinner />&nbsp;<span style={{ fontSize:'.85rem', color:'#94a3b8' }}>Loading eval…</span>
    </div>
  );
  if (error) return (
    <div style={{ margin:'1rem', background:'#fef9c3', border:'1px solid #fde68a',
      borderRadius:8, padding:'.75rem', color:'#92400e', fontSize:'.82rem' }}>
      {error}
    </div>
  );
  if (!evalData) return null;

  const rightSummary   = buildEvalSummary(evalData.went_right, true);
  const wrongSummary   = buildEvalSummary(evalData.went_wrong, false);
  const suggestions    = buildImprovementSuggestions(evalData.went_wrong);

  return (
    <div style={{ padding:'1rem', borderBottom:'1px solid #f1f5f9' }}>
      {/* Score header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'1.25rem' }}>
        <ScoreRing score={evalData.eval_score} />
        <div style={{ fontSize:'.72rem', color:'#94a3b8', textAlign:'right' }}>
          {evalData.went_right.length + evalData.went_wrong.length} metrics evaluated
        </div>
      </div>

      {/* Three vertical sections */}
      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

        {/* ── What went right ── */}
        <div style={{ border:'1px solid #bbf7d0', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'#dcfce7', padding:'.5rem .75rem',
            fontSize:'.72rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#15803d' }}>
            ✅ What went right
          </div>
          {rightSummary && (
            <div style={{ padding:'.6rem .75rem', fontSize:'.78rem', color:'#065f46',
              lineHeight:1.55, fontStyle:'italic', borderBottom:'1px solid #bbf7d0',
              background:'#f0fdf4' }}>
              {rightSummary}
            </div>
          )}
          <MetricsTable items={evalData.went_right}
            accentColor="#15803d" borderColor="#bbf7d0"
            bgColor="#f0fdf4"    textColor="#065f46"  subColor="#6ee7b7" />
        </div>

        {/* ── What went wrong ── */}
        <div style={{ border:'1px solid #fecaca', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'#fee2e2', padding:'.5rem .75rem',
            fontSize:'.72rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#b91c1c' }}>
            ❌ What went wrong
          </div>
          {wrongSummary && (
            <div style={{ padding:'.6rem .75rem', fontSize:'.78rem', color:'#991b1b',
              lineHeight:1.55, fontStyle:'italic', borderBottom:'1px solid #fecaca',
              background:'#fef2f2' }}>
              {wrongSummary}
            </div>
          )}
          <MetricsTable items={evalData.went_wrong}
            accentColor="#b91c1c" borderColor="#fecaca"
            bgColor="#fef2f2"    textColor="#991b1b"  subColor="#fca5a5" />
        </div>

        {/* ── Improvement suggestions ── */}
        <div style={{ border:'1px solid #fed7aa', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'#ffedd5', padding:'.5rem .75rem',
            fontSize:'.72rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#c2410c' }}>
            💡 Improvement suggestions
          </div>
          {suggestions.length === 0 ? (
            <div style={{ padding:'.75rem', fontSize:'.78rem', color:'#94a3b8',
              fontStyle:'italic', background:'#fff7ed' }}>
              No specific improvements identified — the bot performed well overall.
            </div>
          ) : (
            <div style={{ background:'#fff7ed' }}>
              {suggestions.map((s, i) => (
                <div key={s.label} style={{
                  padding:'.6rem .75rem',
                  borderBottom: i < suggestions.length - 1 ? '1px solid #fed7aa' : 'none',
                }}>
                  <div style={{ fontSize:'.78rem', fontWeight:700, color:'#9a3412',
                    marginBottom:'.25rem' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize:'.76rem', color:'#c2410c', lineHeight:1.55 }}>
                    {s.tip}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function FunctionCallsSection({ calls, loading, error }) {
  const [openIdx, setOpenIdx] = useState(null);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'1.5rem', gap:'.5rem', color:'#94a3b8' }}>
      <Spinner size={18} /><span style={{ fontSize:'.82rem' }}>Loading function calls…</span>
    </div>
  );
  if (error) return (
    <div style={{ margin:'1rem', background:'#fef9c3', border:'1px solid #fde68a',
      borderRadius:8, padding:'.75rem', color:'#92400e', fontSize:'.82rem' }}>
      {error}
    </div>
  );
  if (!calls?.length) return (
    <div style={{ padding:'1rem', fontSize:'.8rem', color:'#94a3b8', fontStyle:'italic' }}>
      No function calls found for this session.
    </div>
  );

  // Separate TRANSCRIPT rows from function call rows
  const transcriptRows = calls.filter(c => c.type === 'TRANSCRIPT');
  const fcRows         = calls.filter(c => c.type !== 'TRANSCRIPT');

  return (
    <div>
      {/* ── IVR Call Transcript ── */}
      {transcriptRows.length > 0 && (
        <div style={{ borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ padding:'.5rem .75rem', background:'#f0fdf4',
            fontSize:'.72rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#15803d', borderBottom:'1px solid #bbf7d0' }}>
            📝 IVR Call Transcript
          </div>
          {transcriptRows.map((c, i) => {
            const text = typeof c.data === 'string' ? c.data
              : typeof c.data === 'object' ? JSON.stringify(c.data, null, 2) : String(c.data);
            return (
              <div key={c.message_id || i} style={{ padding:'.75rem 1rem' }}>
                <pre style={{
                  margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word',
                  fontSize:'.78rem', color:'#334155', lineHeight:1.6,
                  background:'#f8fafc', border:'1px solid #e2e8f0',
                  borderRadius:8, padding:'.75rem',
                }}>
                  {text}
                </pre>
                <div style={{ fontSize:'.65rem', color:'#94a3b8', marginTop:'.3rem' }}>
                  {c.created_at?.slice(0, 19)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Function Call Outputs ── */}
      {fcRows.length > 0 && (
        <div>
          <div style={{ padding:'.5rem .75rem', background:'#eff6ff',
            fontSize:'.72rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'.06em', color:'#1d4ed8', borderBottom:'1px solid #bfdbfe',
            borderTop: transcriptRows.length ? '1px solid #f1f5f9' : 'none' }}>
            ⚙️ Function Calls ({fcRows.length})
          </div>
          {fcRows.map((c, i) => {
            const isOpen = openIdx === i;
            // Extract a readable name from the data
            let fnName = c.type;
            let payload = c.data;
            if (payload && typeof payload === 'object') {
              fnName = payload.function_name || payload.name || payload.tool || c.type;
            }
            return (
              <div key={c.message_id || i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  style={{
                    width:'100%', background:'none', border:'none', cursor:'pointer',
                    display:'flex', alignItems:'center', gap:'.6rem',
                    padding:'.6rem .75rem', textAlign:'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}
                >
                  <span style={{
                    fontSize:'.68rem', fontWeight:700, background:'#dbeafe',
                    color:'#1e40af', borderRadius:4, padding:'2px 8px', flexShrink:0,
                    fontFamily:'monospace',
                  }}>
                    {fnName}
                  </span>
                  <span style={{ fontSize:'.7rem', color:'#94a3b8', flex:1 }}>
                    {c.created_at?.slice(0, 19)}
                  </span>
                  <span style={{ fontSize:'.72rem', color:'#94a3b8',
                    transform: isOpen ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding:'.25rem .75rem .75rem 2rem' }}>
                    <pre style={{
                      margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word',
                      fontSize:'.74rem', color:'#1e3a5f', lineHeight:1.55,
                      background:'#eff6ff', border:'1px solid #bfdbfe',
                      borderRadius:8, padding:'.65rem .8rem',
                    }}>
                      {typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TranscriptModal({ ticketId, helpdeskType = 'merchant', showEval = true, recordingPath = null, onClose, onSearch }) {
  const [messages,    setMessages]    = useState([]);
  const [masterData,  setMasterData]  = useState(null);
  const [evalData,    setEvalData]    = useState(null);
  const [fnCalls,     setFnCalls]     = useState([]);
  const [txLoading,   setTxLoading]   = useState(true);
  const [mdLoading,   setMdLoading]   = useState(true);
  const [evalLoading, setEvalLoading] = useState(true);
  const [fnLoading,   setFnLoading]   = useState(true);
  const [txError,     setTxError]     = useState(null);
  const [mdError,     setMdError]     = useState(null);
  const [evalError,   setEvalError]   = useState(null);
  const [fnError,     setFnError]     = useState(null);
  const [rightTab,    setRightTab]    = useState('timeline');   // 'data' | 'timeline'
  const [searchVal,   setSearchVal]   = useState('');
  const [showTools,   setShowTools]   = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    setTxLoading(true); setMdLoading(true); setEvalLoading(true); setFnLoading(true);
    setTxError(null);   setMdError(null);   setEvalError(null);   setFnError(null);

    const params = `?helpdesk_type=${helpdeskType}`;

    axios.get(`${API_BASE}/helpdesk/transcript/${ticketId}${params}`)
      .then(res => {
        setMessages(res.data);
        setTimeout(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, 50);
      })
      .catch(e => setTxError(e.response?.data?.detail || 'Failed to load transcript.'))
      .finally(() => setTxLoading(false));

    axios.get(`${API_BASE}/helpdesk/masterdata/${ticketId}${params}`)
      .then(res => setMasterData(res.data))
      .catch(e => setMdError(e.response?.data?.detail || 'No master data found.'))
      .finally(() => setMdLoading(false));

    axios.get(`${API_BASE}/helpdesk/eval/${ticketId}${params}`)
      .then(res => setEvalData(res.data))
      .catch(e => setEvalError(e.response?.data?.detail || 'No eval data found.'))
      .finally(() => setEvalLoading(false));

    axios.get(`${API_BASE}/helpdesk/function-calls/${ticketId}${params}`)
      .then(res => setFnCalls(res.data))
      .catch(e => setFnError(e.response?.data?.detail || 'No function call data found.'))
      .finally(() => setFnLoading(false));
  }, [ticketId]);

  const allVisible  = messages.filter(m => !m.hidden);
  const toolCount   = allVisible.filter(m => isToolMsg(m.content)).length;
  const visible     = showTools ? allVisible : allVisible.filter(m => !isToolMsg(m.content));

  return (
    /* ── Backdrop ── */
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(15,23,42,.4)', backdropFilter:'blur(2px)',
        display:'flex', justifyContent:'flex-end',
      }}
    >
      {/* ── Drawer ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:'95vw', height:'100vh',
          background:'#fff',
          display:'flex', flexDirection:'column',
          boxShadow:'-8px 0 40px rgba(0,0,0,.18)',
          animation:'slideInRight .25s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* ── Top bar ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'.75rem 1.25rem',
          borderBottom:'1px solid #e2e8f0',
          background:'#fafafe', flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
            <span style={{ fontSize:'1.1rem' }}>💬</span>
            <div>
              {/* Title: show intent tag if available, else fallback to "Ticket Detail" */}
              <div style={{ fontWeight:700, fontSize:'.95rem', color:'#0f172a' }}>
                {masterData?.intent || 'Ticket Detail'}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'.6rem' }}>
                <span style={{ fontSize:'.68rem', color:'#94a3b8', fontFamily:'monospace' }}>
                  {ticketId}
                </span>
                {messages.length > 0 && messages[0].created_at && (
                  <span style={{ fontSize:'.68rem', color:'#64748b' }}>
                    · {new Date(messages[0].created_at).toLocaleString([], {
                        day:'2-digit', month:'short', year:'numeric',
                        hour:'2-digit', minute:'2-digit', hour12:false,
                      })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
            {onSearch && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const v = searchVal.trim();
                  if (!v) return;
                  setSearchVal('');
                  onClose();
                  onSearch(v);
                }}
                style={{ display:'flex', alignItems:'center', gap:'.35rem' }}
              >
                <input
                  type="text"
                  value={searchVal}
                  onChange={e => setSearchVal(e.target.value)}
                  placeholder="Search Session / Merchant ID"
                  style={{
                    padding:'.38rem .65rem', borderRadius:7,
                    border:'1.5px solid #e2e8f0', fontSize:'.78rem',
                    outline:'none', color:'#334155', width:210,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                />
                <button
                  type="submit"
                  disabled={!searchVal.trim()}
                  style={{
                    padding:'.38rem .55rem', borderRadius:7, border:'none',
                    background: searchVal.trim() ? '#2563eb' : '#e2e8f0',
                    color: searchVal.trim() ? '#fff' : '#94a3b8',
                    fontSize:'.9rem', cursor: searchVal.trim() ? 'pointer' : 'not-allowed',
                    lineHeight:1,
                  }}
                >🔍</button>
              </form>
            )}
            <button
              onClick={onClose}
              style={{ background:'#f1f5f9', border:'none', borderRadius:8,
                width:32, height:32, cursor:'pointer', fontSize:'1rem', color:'#64748b',
                display:'flex', alignItems:'center', justifyContent:'center' }}
            >✕</button>
          </div>
        </div>

        {/* ── Two-panel body ── */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* ── LEFT: Transcript ── */}
          <div style={{
            width:'50%', borderRight:'1px solid #e2e8f0',
            display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            <div style={{ padding:'.6rem 1rem', borderBottom:'1px solid #f1f5f9',
              background:'#f8fafc', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <span style={{ fontSize:'.78rem', fontWeight:700, color:'#64748b',
                  textTransform:'uppercase', letterSpacing:'.06em' }}>
                  💬 Chat Transcript
                </span>
                {!txLoading && (
                  <span style={{ fontSize:'.72rem', color:'#94a3b8' }}>
                    {visible.length} msgs
                  </span>
                )}
                {!txLoading && toolCount > 0 && (
                  <button
                    onClick={() => setShowTools(o => !o)}
                    style={{
                      fontSize: '.67rem', fontWeight: 600, cursor: 'pointer',
                      padding: '2px 8px', borderRadius: 4,
                      background: showTools ? '#e0e7ff' : '#f1f5f9',
                      color: showTools ? '#4338ca' : '#64748b',
                      border: `1px solid ${showTools ? '#c7d2fe' : '#e2e8f0'}`,
                    }}
                  >
                    ⚙️ Tools ({toolCount}) {showTools ? '▾ shown' : '▸ hidden'}
                  </button>
                )}
              </div>
              <ListenButton
                ticketId={ticketId}
                createdAt={messages.length > 0 ? messages[0].created_at : null}
                recordingPath={recordingPath}
              />
            </div>

            <div ref={bodyRef}
              style={{ flex:1, overflowY:'auto', padding:'1rem',
                display:'flex', flexDirection:'column', gap:'.75rem' }}>

              {txLoading && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', flex:1, gap:'.75rem', color:'#94a3b8' }}>
                  <Spinner /><span style={{ fontSize:'.85rem' }}>Loading transcript…</span>
                </div>
              )}

              {txError && (
                <div style={{ background:'#fef2f2', border:'1px solid #fca5a5',
                  borderRadius:8, padding:'.75rem', color:'#dc2626', fontSize:'.85rem' }}>
                  {txError}
                </div>
              )}

              {!txLoading && !txError && visible.length === 0 && (
                <div style={{ textAlign:'center', color:'#94a3b8', fontSize:'.85rem', padding:'2rem' }}>
                  No messages found.
                </div>
              )}

              {visible.map(msg => {
                if (isToolMsg(msg.content)) {
                  return <ToolMessage key={msg.message_id} content={msg.content} time={fmt(msg.created_at)} />;
                }
                const { label, bg, color, isUser } = roleMeta(msg.role);
                return (
                  <div key={msg.message_id}
                    style={{ display:'flex', flexDirection:'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start' }}>

                    {/* Meta row */}
                    <div style={{ fontSize:'.65rem', color:'#94a3b8', marginBottom:'.2rem',
                      display:'flex', alignItems:'center', gap:'.3rem',
                      flexDirection: isUser ? 'row-reverse' : 'row' }}>
                      <span>{label}</span>
                      {isUser && <LangTag lang={msg.lang} />}
                      <span>· {fmt(msg.created_at)}</span>
                    </div>

                    {/* Bubble */}
                    <div style={{
                      background:bg, color,
                      borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      padding:'.55rem .85rem', maxWidth:'88%',
                      fontSize:'.83rem', lineHeight:1.55,
                      wordBreak:'break-word',
                      border: isUser ? 'none' : '1px solid #e2e8f0',
                    }}>
                      {isUser ? (
                        isObjectDump(msg.content)
                          ? <ObjectDumpMessage content={msg.content} />
                          : <span style={{ whiteSpace:'pre-wrap' }}>{msg.content}</span>
                      ) : (
                        <div className="md-bubble">
                          {splitBotContent(msg.content).map((seg, si) =>
                            seg.type === 'tool'
                              ? <InlineToolCall key={si} content={seg.content} />
                              : <ReactMarkdown key={si} remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CTA pills */}
                    {msg.cta_options?.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'.35rem',
                        marginTop:'.4rem', maxWidth:'88%' }}>
                        {msg.cta_options.map((cta, i) => (
                          <span key={i} style={{ background:'#dbeafe', color:'#1d4ed8',
                            borderRadius:20, padding:'.2rem .6rem',
                            fontSize:'.72rem', fontWeight:600 }}>{cta}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Tabs (Eval/Data | Debug Timeline) ── */}
          <div style={{ width:'50%', display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Tab bar */}
            <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', flexShrink:0 }}>
              {[
                { id:'data',     label:'📊 Eval & Data'      },
                { id:'timeline', label:'🤖 Debug Bot'   },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '.5rem 1rem', fontSize: '.75rem', fontWeight: 700,
                    color: rightTab === tab.id ? '#1d4ed8' : '#64748b',
                    borderBottom: rightTab === tab.id ? '2px solid #1d4ed8' : '2px solid transparent',
                    transition: 'color .15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Eval & Data */}
            {rightTab === 'data' && (
              <div style={{ flex:1, overflowY:'auto' }}>
                {/* Eval card */}
                {showEval && <EvalSection evalData={evalData} loading={evalLoading} error={evalError} />}

                {/* Function Calls header */}
                <div style={{ padding:'.6rem 1rem', borderBottom:'1px solid #f1f5f9',
                  background:'#f8fafc', flexShrink:0 }}>
                  <span style={{ fontSize:'.78rem', fontWeight:700, color:'#64748b',
                    textTransform:'uppercase', letterSpacing:'.06em' }}>
                    ⚙️ Function Calls &amp; Transcript
                  </span>
                  {!fnLoading && fnCalls.length > 0 && (
                    <span style={{ fontSize:'.72rem', color:'#94a3b8', marginLeft:'.5rem' }}>
                      {fnCalls.length} rows
                    </span>
                  )}
                </div>
                <FunctionCallsSection calls={fnCalls} loading={fnLoading} error={fnError} />

                {/* Master data header */}
                <div style={{ padding:'.6rem 1rem', borderBottom:'1px solid #f1f5f9',
                  background:'#f8fafc', flexShrink:0 }}>
                  <span style={{ fontSize:'.78rem', fontWeight:700, color:'#64748b',
                    textTransform:'uppercase', letterSpacing:'.06em' }}>
                    🗂️ Master Data
                  </span>
                  {!mdLoading && masterData && (
                    <span style={{ fontSize:'.72rem', color:'#94a3b8', marginLeft:'.5rem' }}>
                      {masterData.sections.length} sections · click to expand
                    </span>
                  )}
                </div>

                {mdLoading && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'center', padding:'2rem', gap:'.75rem', color:'#94a3b8' }}>
                    <Spinner /><span style={{ fontSize:'.85rem' }}>Loading master data…</span>
                  </div>
                )}

                {mdError && (
                  <div style={{ margin:'1rem', background:'#fef2f2', border:'1px solid #fca5a5',
                    borderRadius:8, padding:'.75rem', color:'#dc2626', fontSize:'.85rem' }}>
                    {mdError}
                  </div>
                )}

                {!mdLoading && !mdError && masterData?.sections?.map(section => (
                  <AccordionSection key={section.key} section={section} />
                ))}
              </div>
            )}

            {/* Tab: Debug Timeline */}
            {rightTab === 'timeline' && (
              <div style={{ flex:1, overflowY:'auto' }}>
                <SessionTimeline
                  sessionId={ticketId}
                  helpdeskType={helpdeskType}
                  sessionDatetime={
                    messages.length > 0 && messages[0].created_at
                      ? (() => {
                          // created_at is UTC (no 'Z' suffix in DB) — convert to IST (+5:30)
                          const utcMs = new Date(messages[0].created_at + 'Z').getTime();
                          const istDate = new Date(utcMs + 5.5 * 60 * 60 * 1000);
                          return istDate.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:MM:SS" in IST
                        })()
                      : undefined
                  }
                />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
