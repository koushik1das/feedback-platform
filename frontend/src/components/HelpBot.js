import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { API_BASE } from '../config';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Colour palette (Paytm blue theme) ─────────────────────────────────────────
const CHART_COLORS = [
  '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  '#1d4ed8', '#0ea5e9', '#06b6d4', '#0284c7',
];

// ── Chart auto-detection helpers ──────────────────────────────────────────────

function isDateLike(val) {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}(-\d{2})?$/.test(val);
}

function isNumeric(val) {
  return val !== null && val !== undefined && val !== '' && !isNaN(Number(val));
}

/**
 * Decide best chart type from column names + row data.
 * Returns: "bar" | "line" | "pie" | null (no chart possible)
 */
function detectChartConfig(columns, rows) {
  if (!rows || rows.length === 0 || columns.length < 2) return null;

  const labelCol = columns[0];
  const numericCols = columns.slice(1).filter((_, ci) =>
    rows.slice(0, 5).some(r => isNumeric(r[ci + 1]))
  );
  if (numericCols.length === 0) return null;

  // Line chart: first column looks like a date
  const firstVals = rows.slice(0, 5).map(r => r[0]);
  if (firstVals.every(v => isDateLike(String(v)))) {
    return { type: 'line', labelCol, numericCols };
  }

  // Pie chart: exactly 2 columns, ≤ 12 rows
  if (columns.length === 2 && rows.length <= 12) {
    return { type: 'pie', labelCol, numericCols };
  }

  // Default: bar
  return { type: 'bar', labelCol, numericCols };
}

function buildChartData(columns, rows) {
  return rows.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = isNumeric(row[i]) ? Number(row[i]) : row[i];
    });
    return obj;
  });
}

// ── Chart Components ──────────────────────────────────────────────────────────

const MAX_LABEL_CHARS = 22;

function YAxisTick({ x, y, payload, setTooltip }) {
  const full = String(payload?.value ?? '');
  const clipped = full.length > MAX_LABEL_CHARS;
  const display = clipped ? full.slice(0, MAX_LABEL_CHARS) + '…' : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={4} textAnchor="end" fill="#64748b" fontSize={11}
        onMouseEnter={clipped ? (e) => setTooltip({ text: full, x: e.clientX, y: e.clientY }) : undefined}
        onMouseMove={clipped ? (e) => setTooltip({ text: full, x: e.clientX, y: e.clientY }) : undefined}
        onMouseLeave={clipped ? () => setTooltip(null) : undefined}
      >
        {display}
      </text>
    </g>
  );
}

function LabelTooltip({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div style={{
      position: 'fixed',
      left: tooltip.x + 12,
      top: tooltip.y - 28,
      background: '#1e293b',
      color: '#fff',
      fontSize: '.72rem',
      padding: '4px 9px',
      borderRadius: 6,
      pointerEvents: 'none',
      zIndex: 9999,
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
    }}>
      {tooltip.text}
    </div>
  );
}

function HelpBotBarChart({ columns, rows, cfg }) {
  const [activeCol, setActiveCol] = useState(cfg.numericCols[0]);
  const [colFilter, setColFilter] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const data = buildChartData(columns, rows);
  const maxLabel = Math.max(...data.map(d => String(d[cfg.labelCol] ?? '').length));
  const yWidth = Math.min(Math.max(Math.min(maxLabel, MAX_LABEL_CHARS) * 7 + 16, 80), 200);
  const chartHeight = Math.max(200, data.length * 36 + 40);
  const manyMetrics = cfg.numericCols.length > 8;

  const filteredCols = colFilter.trim()
    ? cfg.numericCols.filter(c => c.toLowerCase().includes(colFilter.trim().toLowerCase()))
    : cfg.numericCols;

  return (
    <div>
      <LabelTooltip tooltip={tooltip} />
      {/* Metric selector — only shown when multiple numeric cols */}
      {cfg.numericCols.length > 1 && (
        <div style={{ padding: '.3rem .5rem .2rem' }}>
          {/* Filter input for wide datasets (e.g. function call queries with 80+ metrics) */}
          {manyMetrics && (
            <input
              type="text"
              value={colFilter}
              onChange={e => {
                setColFilter(e.target.value);
                const matched = cfg.numericCols.find(c =>
                  c.toLowerCase().includes(e.target.value.trim().toLowerCase())
                );
                if (matched) setActiveCol(matched);
              }}
              placeholder="Filter metrics… (e.g. success_pct, attempts)"
              style={{
                width: '100%', boxSizing: 'border-box',
                marginBottom: '.3rem', padding: '4px 9px',
                fontSize: '.72rem', borderRadius: 6,
                border: '1px solid #e2e8f0', outline: 'none',
                color: '#334155', background: '#f8fafc',
              }}
            />
          )}
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            {filteredCols.map((col, i) => (
              <button
                key={col}
                onClick={() => setActiveCol(col)}
                style={{
                  fontSize: '.69rem', fontWeight: 600,
                  padding: '2px 9px', borderRadius: 5, cursor: 'pointer',
                  background: activeCol === col ? CHART_COLORS[cfg.numericCols.indexOf(col) % CHART_COLORS.length] : 'transparent',
                  color: activeCol === col ? '#fff' : '#64748b',
                  border: activeCol === col
                    ? `1px solid ${CHART_COLORS[cfg.numericCols.indexOf(col) % CHART_COLORS.length]}`
                    : '1px solid #e2e8f0',
                  transition: 'all .12s',
                }}
              >
                {col}
              </button>
            ))}
            {filteredCols.length === 0 && (
              <span style={{ fontSize: '.72rem', color: '#94a3b8', padding: '2px 4px' }}>No metrics match</span>
            )}
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => Number(v).toLocaleString()} />
          <YAxis
            type="category"
            dataKey={cfg.labelCol}
            tick={<YAxisTick setTooltip={setTooltip} />}
            width={yWidth}
          />
          <Tooltip
            contentStyle={{ fontSize: '.75rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(val) => [Number(val).toLocaleString(), activeCol]}
          />
          <Bar
            dataKey={activeCol}
            fill={CHART_COLORS[cfg.numericCols.indexOf(activeCol) % CHART_COLORS.length]}
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HelpBotLineChart({ columns, rows, cfg }) {
  const data = buildChartData(columns, rows);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={cfg.labelCol} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={45} />
        <Tooltip
          contentStyle={{ fontSize: '.75rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
          formatter={(val) => [Number(val).toLocaleString(), '']}
        />
        {cfg.numericCols.length > 1 && <Legend wrapperStyle={{ fontSize: '.72rem' }} />}
        {cfg.numericCols.map((col, i) => (
          <Line
            key={col} type="monotone" dataKey={col}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const RADIAN = Math.PI / 180;
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < 0.05) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function HelpBotPieChart({ columns, rows, cfg }) {
  const data = buildChartData(columns, rows).map(d => ({
    name: String(d[cfg.labelCol] ?? ''),
    value: Number(d[cfg.numericCols[0]]) || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data} cx="50%" cy="50%" outerRadius={95}
          dataKey="value" nameKey="name"
          labelLine={false} label={PieLabel}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: '.75rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
          formatter={(val) => [Number(val).toLocaleString(), '']}
        />
        <Legend
          wrapperStyle={{ fontSize: '.72rem', paddingTop: 8 }}
          formatter={(val) => val.length > 22 ? val.slice(0, 22) + '…' : val}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── ChartView ─────────────────────────────────────────────────────────────────

function ChartView({ columns, rows }) {
  const cfg = detectChartConfig(columns, rows);
  const [chartType, setChartType] = useState(cfg?.type || 'bar');

  if (!cfg) return null;

  const availableTypes = [];
  if (cfg.numericCols.length >= 1) availableTypes.push('bar', 'line');
  if (columns.length === 2 && rows.length <= 12) availableTypes.push('pie');

  const renderChart = () => {
    if (chartType === 'line') return <HelpBotLineChart columns={columns} rows={rows} cfg={cfg} />;
    if (chartType === 'pie' && columns.length === 2) return <HelpBotPieChart columns={columns} rows={rows} cfg={cfg} />;
    return <HelpBotBarChart columns={columns} rows={rows} cfg={cfg} />;
  };

  const typeLabel = { bar: '📊 Bar', line: '📈 Line', pie: '🥧 Pie' };

  return (
    <div style={{
      marginTop: '.65rem',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      background: '#fff',
      overflow: 'hidden',
    }}>
      {/* Chart type switcher */}
      {availableTypes.length > 1 && (
        <div style={{
          display: 'flex', gap: '.3rem', padding: '.45rem .65rem',
          borderBottom: '1px solid #f1f5f9', background: '#f8fafc',
        }}>
          {availableTypes.map(t => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              style={{
                fontSize: '.7rem', fontWeight: 600,
                padding: '2px 9px', borderRadius: 5, cursor: 'pointer',
                background: chartType === t ? '#2563eb' : 'transparent',
                color: chartType === t ? '#fff' : '#64748b',
                border: chartType === t ? '1px solid #2563eb' : '1px solid #e2e8f0',
                transition: 'all .12s',
              }}
            >
              {typeLabel[t]}
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: '.65rem .5rem .5rem' }}>
        {renderChart()}
      </div>
    </div>
  );
}

// ── DataTable ─────────────────────────────────────────────────────────────────

const RAW_PAGE = 25;

// Threshold above which a cell value is treated as "long text"
const LONG_TEXT_CHARS = 80;

function CellValue({ value }) {
  const str = value === null || value === undefined ? '—' : String(value);
  if (str.length <= LONG_TEXT_CHARS) return <span>{str}</span>;
  return (
    <div style={{
      maxHeight: 120,
      overflowY: 'auto',
      maxWidth: 340,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      lineHeight: 1.45,
      paddingRight: 4,
    }}>
      {str}
    </div>
  );
}

function DataTable({ columns, rows }) {
  const [limit, setLimit] = useState(RAW_PAGE);
  if (!columns.length) return null;

  const visible  = rows.slice(0, limit);
  const hasMore  = rows.length > limit;
  const remaining = Math.min(RAW_PAGE, rows.length - limit);

  return (
    <div style={{ overflowX: 'auto', marginTop: '.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.78rem', minWidth: 300 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: '.45rem .75rem', textAlign: 'left',
                fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                borderBottom: '1px solid #e2e8f0',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
              {row.map((cell, ci) => {
                const str = cell === null || cell === undefined ? '—' : String(cell);
                const isLong = str.length > LONG_TEXT_CHARS;
                return (
                  <td key={ci} style={{
                    padding: '.4rem .75rem', color: '#334155',
                    borderBottom: '1px solid #f1f5f9',
                    whiteSpace: isLong ? 'normal' : 'nowrap',
                    verticalAlign: isLong ? 'top' : 'middle',
                  }}>
                    <CellValue value={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{
        padding: '.35rem .75rem', fontSize: '.7rem', color: '#94a3b8',
        background: '#f8fafc', borderTop: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem',
        flexWrap: 'wrap',
      }}>
        <span>Showing {visible.length} of {rows.length} row{rows.length !== 1 ? 's' : ''}</span>
        {hasMore && (
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button
              onClick={() => setLimit(l => l + RAW_PAGE)}
              style={{
                fontSize: '.68rem', fontWeight: 600, cursor: 'pointer',
                color: '#2563eb', background: '#eff6ff',
                border: '1px solid #bfdbfe', borderRadius: 5, padding: '2px 8px',
              }}
            >
              Load {remaining} more
            </button>
            <button
              onClick={() => setLimit(rows.length)}
              style={{
                fontSize: '.68rem', fontWeight: 600, cursor: 'pointer',
                color: '#64748b', background: '#f1f5f9',
                border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 8px',
              }}
            >
              Show all {rows.length}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BotActions ────────────────────────────────────────────────────────────────

function BotActions({ sql, columns, rows }) {
  const [showChart, setShowChart] = useState(true);   // chart visible by default
  const [showData,  setShowData]  = useState(false);
  const [showSql,   setShowSql]   = useState(false);

  if (!sql) return null;

  const hasChart = detectChartConfig(columns, rows) !== null;

  return (
    <div style={{ marginTop: '.65rem', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
      {/* CTA row */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {hasChart && (
          <button
            onClick={() => setShowChart(o => !o)}
            style={{
              fontSize: '.72rem', fontWeight: 600,
              color: showChart ? '#1d4ed8' : '#2563eb',
              background: showChart ? '#dbeafe' : '#eff6ff',
              border: `1px solid ${showChart ? '#93c5fd' : '#bfdbfe'}`,
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            }}
          >
            {showChart ? '▼ Hide Chart' : '📊 View Chart'}
          </button>
        )}
        {columns?.length > 0 && (
          <button
            onClick={() => setShowData(o => !o)}
            style={{
              fontSize: '.72rem', fontWeight: 600,
              color: showData ? '#1d4ed8' : '#2563eb',
              background: showData ? '#dbeafe' : '#eff6ff',
              border: `1px solid ${showData ? '#93c5fd' : '#bfdbfe'}`,
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            }}
          >
            {showData ? '▼ Hide Raw Data' : '🗂 View Raw Data'}
          </button>
        )}
        <button
          onClick={() => setShowSql(o => !o)}
          style={{
            fontSize: '.72rem', color: '#64748b',
            background: showSql ? '#f1f5f9' : 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {showSql ? '▼ Hide SQL' : '▶ View SQL'}
        </button>
      </div>

      {/* Chart */}
      {showChart && hasChart && <ChartView columns={columns} rows={rows} />}

      {/* Raw data table */}
      {showData && columns?.length > 0 && <DataTable columns={columns} rows={rows} />}

      {/* SQL */}
      {showSql && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { navigator.clipboard.writeText(sql); }}
            title="Copy SQL"
            style={{
              position: 'absolute', top: 6, right: 8,
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 5, padding: '2px 8px', cursor: 'pointer',
              color: '#94a3b8', fontSize: '.68rem', fontFamily: 'monospace',
              lineHeight: 1.6, zIndex: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#64748b'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#334155'; }}
          >
            copy
          </button>
          <pre style={{
            padding: '.65rem .85rem', borderRadius: 8,
            background: '#0f172a', color: '#e2e8f0', fontSize: '.71rem',
            overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
          }}>
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

function Message({ msg }) {
  const isUser  = msg.role === 'user';
  const isError = msg.type === 'error';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '.9rem',
    }}>
      {!isUser && (
        <div style={{ fontSize: '.68rem', color: '#94a3b8', marginBottom: '.25rem', paddingLeft: '.2rem' }}>
          🤖 Help Bot
        </div>
      )}
      <div style={{
        maxWidth: '88%',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '.6rem .9rem',
        background: isUser ? '#2563eb' : isError ? '#fef2f2' : '#f8fafc',
        color: isUser ? '#fff' : isError ? '#dc2626' : '#1e293b',
        border: isUser ? 'none' : isError ? '1px solid #fca5a5' : '1px solid #e2e8f0',
        fontSize: '.84rem', lineHeight: 1.6,
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <>
            <div className="helpbot-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content || (msg.type === 'table' ? `Query returned **${msg.rows?.length ?? 0}** row(s). View the data below.` : '')}
              </ReactMarkdown>
            </div>
            <BotActions sql={msg.sql} columns={msg.columns} rows={msg.rows} />
          </>
        )}
      </div>
    </div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

const STAGES = [
  'Building SQL Query',
  'Running Query',
  'Generating Response',
  'Response Generated',
];

function StageIndicator({ stage }) {
  // stage: 1-based index of the current active stage (4 = done)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '.9rem' }}>
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '14px 14px 14px 4px',
        padding: '.65rem 1rem',
        display: 'flex', flexDirection: 'column', gap: '.38rem',
        minWidth: 210,
      }}>
        {STAGES.map((label, i) => {
          const idx = i + 1;
          const done    = stage > idx;
          const active  = stage === idx;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              {/* Icon */}
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.65rem', fontWeight: 700,
                background: done ? '#2563eb' : active ? '#eff6ff' : '#f1f5f9',
                border: done ? '2px solid #2563eb' : active ? '2px solid #2563eb' : '2px solid #e2e8f0',
                color: done ? '#fff' : active ? '#2563eb' : '#cbd5e1',
                transition: 'all .3s',
              }}>
                {done ? '✓' : active ? (
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#2563eb',
                    animation: 'helpbotBounce .9s infinite',
                  }} />
                ) : idx}
              </div>
              {/* Label */}
              <span style={{
                fontSize: '.78rem',
                fontWeight: active ? 600 : done ? 500 : 400,
                color: done ? '#2563eb' : active ? '#0f172a' : '#94a3b8',
                transition: 'all .3s',
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Top Settlement issues in last 7 days',
  'Soundbox complaint trend last 30 days',
  'How many sessions escalated to agent yesterday?',
  'Which entity has the lowest bot resolution rate?',
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function HelpBot() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [stage,    setStage]    = useState(0);
  const stageTimers = useRef([]);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const clearStageTimers = () => {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
  };

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setStage(1);

    // Advance stages on timers — stage 4 set when response arrives
    clearStageTimers();
    stageTimers.current.push(setTimeout(() => setStage(2), 2500));
    stageTimers.current.push(setTimeout(() => setStage(3), 5500));

    const history = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    try {
      const res = await axios.post(`${API_BASE}/helpbot/chat`, { message: userText, history });
      const d = res.data;
      clearStageTimers();
      setStage(4);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant', type: d.type, content: d.message,
          sql: d.sql, columns: d.columns, rows: d.rows,
        }]);
        setLoading(false);
        setStage(0);
      }, 600);
    } catch (err) {
      clearStageTimers();
      setStage(0);
      setMessages(prev => [...prev, {
        role: 'assistant', type: 'error',
        content: err.response?.data?.detail || 'Something went wrong. Please try again.',
        sql: null, columns: [], rows: [],
      }]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      <style>{`
        @keyframes helpbotBounce {
          0%,80%,100% { transform: translateY(0); }
          40%          { transform: translateY(-6px); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .helpbot-md p            { margin: 0 0 .4rem; }
        .helpbot-md p:last-child { margin-bottom: 0; }
        .helpbot-md ul, .helpbot-md ol { margin: .25rem 0 .25rem 1.2rem; padding: 0; }
        .helpbot-md li           { margin-bottom: .18rem; }
        .helpbot-md code         { background: #e2e8f0; padding: 1px 5px; border-radius: 3px; font-size: .76rem; }
        .helpbot-md strong       { font-weight: 600; }
        .helpbot-md h3           { font-size: .88rem; font-weight: 700; margin: .6rem 0 .3rem; color: #0f172a; }
        .helpbot-md h2           { font-size: .95rem; font-weight: 700; margin: .7rem 0 .3rem; color: #0f172a; }
        .helpbot-md table        { border-collapse: collapse; width: 100%; margin: .5rem 0; font-size: .76rem; }
        .helpbot-md th           { background: #f1f5f9; padding: .3rem .6rem; text-align: left; font-weight: 600; color: #475569; border: 1px solid #e2e8f0; white-space: nowrap; }
        .helpbot-md td           { padding: .28rem .6rem; color: #334155; border: 1px solid #e2e8f0; white-space: nowrap; }
        .helpbot-md tr:nth-child(even) td { background: #f8fafc; }
      `}</style>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Open Help Bot"
        style={{
          position: 'fixed', bottom: '1.75rem', right: '1.75rem', zIndex: 1100,
          display: 'flex', alignItems: 'center', gap: '.45rem',
          background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 28,
          padding: '.6rem 1.1rem',
          fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(37,99,235,.4)',
          transition: 'background .15s, transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
        onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
      >
        <span style={{ fontSize: '1rem' }}>🤖</span> Help Bot
      </button>

      {/* Backdrop + Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(15,23,42,.4)', backdropFilter: 'blur(2px)',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          {/* Drawer — 50vw, full height */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '50vw', height: '100vh',
              background: '#fff',
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 40px rgba(0,0,0,.18)',
              animation: 'slideInRight .25s cubic-bezier(.4,0,.2,1)',
            }}
          >
            {/* ── Top bar ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '.75rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#fafafe', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#0f172a' }}>Help Bot</div>
                  <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>Ask anything — I'll query Trino and show results</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    style={{
                      fontSize: '.72rem', color: '#64748b', background: '#f1f5f9',
                      border: '1px solid #e2e8f0', borderRadius: 6,
                      padding: '3px 10px', cursor: 'pointer',
                    }}
                  >
                    Clear chat
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: '#f1f5f9', border: 'none', borderRadius: 8,
                    width: 32, height: 32, cursor: 'pointer',
                    fontSize: '1rem', color: '#64748b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            </div>

            {/* ── Messages area ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '.6rem' }}>👋</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', marginBottom: '.35rem' }}>
                    Hi! I'm your data assistant.
                  </div>
                  <div style={{ fontSize: '.84rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Ask me anything about your support data — I'll write and run the SQL for you.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', maxWidth: 420, margin: '0 auto' }}>
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        style={{
                          background: '#f8fafc', border: '1.5px solid #e2e8f0',
                          borderRadius: 10, padding: '.55rem 1rem',
                          fontSize: '.82rem', color: '#334155',
                          cursor: 'pointer', textAlign: 'left', lineHeight: 1.4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                      >
                        💬 {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && <StageIndicator stage={stage} />}
              <div ref={bottomRef} />
            </div>

            {/* ── Input area ── */}
            <div style={{
              padding: '.85rem 1.25rem',
              borderTop: '1px solid #e2e8f0',
              background: '#fafafe', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your data…  (e.g. top issues last 7 days)"
                  rows={2}
                  disabled={loading}
                  style={{
                    flex: 1, resize: 'none',
                    border: '1.5px solid #e2e8f0', borderRadius: 10,
                    padding: '.55rem .8rem', fontSize: '.84rem',
                    color: '#334155', outline: 'none',
                    lineHeight: 1.5, fontFamily: 'inherit',
                    background: '#fff',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  style={{
                    padding: '.55rem .85rem', borderRadius: 10, border: 'none',
                    background: input.trim() && !loading ? '#2563eb' : '#e2e8f0',
                    color: input.trim() && !loading ? '#fff' : '#94a3b8',
                    cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
                    transition: 'background .15s',
                  }}
                >
                  ➤
                </button>
              </div>
              <div style={{ fontSize: '.67rem', color: '#94a3b8', marginTop: '.35rem', paddingLeft: '.2rem' }}>
                Enter to send · Shift+Enter for new line
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
