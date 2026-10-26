import React, { useState, useEffect } from 'react';
import {
  Shield, LogOut, Utensils, ClipboardList, Plus, Trash2, Edit3,
  CheckCircle, AlertTriangle, Scale, Lock, Mail, RefreshCw, X, Save,
  Battery, MapPin, Navigation, Wifi, QrCode, Printer, ArrowRight, AlertCircle as AlertIcon,
  Star, Download, LayoutDashboard, History as HistoryIcon, Search, RotateCcw, Clock
} from 'lucide-react';
import { db, auth } from '../firebase';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';

const TABLES = ['Table 01', 'Table 02', 'Table 03', 'Table 04', 'Table 05', 'Table 06'];
const TAG_OPTIONS = ['veg', 'spicy', 'popular'];
const EMPTY_FOOD = { name: '', price: '', category: 'Mains', image: '', desc: '', tags: [], soldOut: false };

const ROBOT_DISPATCH_STATUS = 'DELIVERING';

const STAGE_LABELS = ['Pending', 'Preparing', 'Ready', 'On the way', 'Served'];

const NEXT_ACTION = [
  { label: 'Start preparing', status: 'PREPARING' },
  { label: 'Mark ready', status: 'READY' },
  { label: 'Dispatch robot', status: 'CONFIRMED & DISPATCHED' },
  { label: 'Mark served', status: 'SERVED' },
  null,
];

const getStage = (status) => {
  const s = String(status || 'PENDING').toUpperCase();
  if (s.includes('SERVED') || s.includes('COMPLETED')) return 4;
  if (s.includes('CONFIRMED') || s.includes('DISPATCHED')) return 3;
  if (s.includes('READY')) return 2;
  if (s.includes('PREPAR') || s.includes('COOKING')) return 1;
  return 0;
};

const stageBadge = (stage) => {
  if (stage === 0) return 'bg-[#f2b632] text-[#3a1a0b]';
  if (stage === 1) return 'bg-[#b5542a] text-white';
  if (stage === 2) return 'bg-[#2e7d32] text-white';
  if (stage === 3) return 'bg-[#1f5f8b] text-white';
  return 'bg-[#3a1a0b]/15 text-[#3a1a0b]/70';
};

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  return [];
};

const inp = 'w-full bg-white border-2 border-[#3a1a0b]/25 px-3 py-2.5 text-sm focus:outline-none focus:border-[#3a1a0b]';
const lbl = 'f-cond uppercase tracking-widest text-xs block mb-1';
const btnRed = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#d92b2b] text-white hover:bg-[#b82020] transition-colors';
const btnBrown = 'f-cond uppercase tracking-widest text-xs px-5 py-3 bg-[#3a1a0b] text-[#f2b632] hover:bg-[#2a1208] transition-colors';
const btnLine = 'f-cond uppercase tracking-widest text-xs px-4 py-3 border-2 border-[#3a1a0b]/30 hover:border-[#3a1a0b] transition-colors';

function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap');
      .f-slab { font-family: 'Alfa Slab One', Georgia, serif; font-weight: 400; }
      .f-cond { font-family: 'Oswald', 'Arial Narrow', sans-serif; }
      .f-body { font-family: 'Montserrat', system-ui, sans-serif; }
    `}</style>
  );
}

// ================= Order helpers (used by Live orders, History and Dashboard) =================
const orderNo = (o) => String(o.id || '').slice(-6).toUpperCase();
const orderTotal = (o) => Number(o.total) || 0;
const orderTime = (o) => Number(o.timestamp) || 0;
const fmtMoney = (n) => `LKR ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// local midnight, n days ago (0 = today)
const daysAgoStart = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
};
const itemsSummary = (o) => (o.items || []).map(it => `${it.qty}× ${it.name}`).join(', ');

// cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas
const downloadCsv = (filename, rows) => {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = rows.map(r => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const RANGES = [
  { id: 1, label: 'Today' },
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 0, label: 'All time' },
];
const STAGE_COLORS = ['#f2b632', '#b5542a', '#2e7d32', '#1f5f8b', '#3a1a0b'];

// Everything the dashboard shows, computed from the orders list.
// Revenue counts SERVED orders only (food that was actually delivered).
function computeStats(orders, rangeDays, nowTs) {
  const from = rangeDays === 0 ? 0 : daysAgoStart(rangeDays - 1);
  const inRange = orders.filter(o => orderTime(o) >= from);
  const served = inRange.filter(o => getStage(o.status) === 4);
  const revenue = served.reduce((s, o) => s + orderTotal(o), 0);

  const stageCounts = [0, 0, 0, 0, 0];
  inRange.forEach(o => { stageCounts[getStage(o.status)] += 1; });

  const dishMap = {};
  inRange.forEach(o => (o.items || []).forEach(it => {
    const key = it.name || 'Unknown';
    if (!dishMap[key]) dishMap[key] = { name: key, qty: 0, revenue: 0 };
    const qty = Number(it.qty) || 0;
    dishMap[key].qty += qty;
    dishMap[key].revenue += (Number(it.price) || 0) * qty;
  }));
  const topDishes = Object.values(dishMap).sort((a, b) => b.qty - a.qty).slice(0, 6);

  // per-day series (Today shows the last 7 days, All time the last 30, so the chart is never a single bar)
  const chartDays = rangeDays === 0 ? 30 : rangeDays === 1 ? 7 : rangeDays;
  const days = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const start = daysAgoStart(i);
    days.push({ key: dayKey(start), date: new Date(start), orders: 0, revenue: 0 });
  }
  const dayIndex = {};
  days.forEach((d, i) => { dayIndex[d.key] = i; });
  orders.forEach(o => {
    if (!orderTime(o)) return;
    const idx = dayIndex[dayKey(orderTime(o))];
    if (idx === undefined) return;
    days[idx].orders += 1;
    if (getStage(o.status) === 4) days[idx].revenue += orderTotal(o);
  });

  // busiest hours (opening hours 10-22 always shown, extended if orders fall outside them)
  const hourCounts = Array(24).fill(0);
  inRange.forEach(o => { if (orderTime(o)) hourCounts[new Date(orderTime(o)).getHours()] += 1; });
  let lo = 10;
  let hi = 22;
  hourCounts.forEach((c, h) => { if (c > 0) { lo = Math.min(lo, h); hi = Math.max(hi, h); } });
  const hours = [];
  for (let h = lo; h <= hi; h++) hours.push({ hour: h, count: hourCounts[h] });

  // orders still being handled, longest-waiting first
  const waiting = orders
    .filter(o => getStage(o.status) < 4)
    .map(o => ({ ...o, ageMin: Math.max(0, Math.floor((nowTs - orderTime(o)) / 60000)) }))
    .sort((a, b) => b.ageMin - a.ageMin);

  return {
    placed: inRange.length,
    servedCount: served.length,
    revenue,
    avg: served.length ? revenue / served.length : 0,
    activeCount: waiting.length,
    stageCounts,
    topDishes,
    days,
    hours,
    waiting,
  };
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

// Simple single-series bar chart: thin bars on a baseline, hover (or focus) a bar to read its value
function BarChart({ data, format }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map(d => d.value));
  const step = data.length > 10 ? Math.ceil(data.length / 8) : 1;
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="h-6 text-sm" aria-live="polite">
        {active
          ? <span><strong>{active.tooltip}</strong></span>
          : <span className="text-[#3a1a0b]/50">Hover a bar to see the exact figure</span>}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-[#3a1a0b]/50 h-44 w-14 text-right pr-1">
          <span>{format(max)}</span>
          <span>{format(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-44 border-b border-[#3a1a0b]/40">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-[#3a1a0b]/15" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#3a1a0b]/15" />
            <div className="absolute inset-0 flex items-end gap-1" onMouseLeave={() => setHover(null)}>
              {data.map((d, i) => (
                <div
                  key={d.key}
                  tabIndex={0}
                  role="img"
                  aria-label={d.tooltip}
                  title={d.tooltip}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="flex-1 h-full flex items-end justify-center outline-none"
                >
                  <div
                    className="w-full max-w-[28px] rounded-t-[4px] transition-colors"
                    style={{
                      height: `${(d.value / max) * 100}%`,
                      minHeight: d.value > 0 ? 3 : 0,
                      background: hover === i ? '#d92b2b' : '#3a1a0b',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-1 mt-1.5">
            {data.map((d, i) => (
              <div key={d.key} className="flex-1 relative h-4">
                {i % step === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-[#3a1a0b]/60">
                    {d.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Horizontal bars with the label and number written out (colour never carries the meaning alone)
function HBarList({ rows, emptyText }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) {
    return <p className="text-sm text-[#3a1a0b]/60 py-6 text-center">{emptyText}</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="text-[#3a1a0b]/70 whitespace-nowrap">{r.right}</span>
          </div>
          <div className="h-2 bg-[#3a1a0b]/10 mt-1 rounded-[4px] overflow-hidden">
            <div
              className="h-full rounded-[4px]"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0, background: r.color || '#3a1a0b' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="f-cond uppercase tracking-widest text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-[#3a1a0b]/60 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`f-cond uppercase tracking-widest text-xs px-3.5 py-1.5 rounded-full border-2 transition-colors ${
        active ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]' : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
      }`}
    >
      {children}
    </button>
  );
}

function DashboardTab({ orders, menuItems, reviews, subscribers, robot, robotWeight, weightLimit, goTab }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'orders'
  const [showTable, setShowTable] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  // keeps "waiting X min" fresh
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const s = computeStats(orders, rangeDays, nowTs);
  const rangeLabel = (RANGES.find(r => r.id === rangeDays) || RANGES[0]).label.toLowerCase();

  const dayLabel = (d) => (s.days.length <= 7
    ? d.date.toLocaleDateString('en-GB', { weekday: 'short' })
    : d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  const dayFull = (d) => d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const dayData = s.days.map(d => ({
    key: d.key,
    label: dayLabel(d),
    value: metric === 'revenue' ? d.revenue : d.orders,
    tooltip: `${dayFull(d)}: ${fmtMoney(d.revenue)} revenue · ${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`,
  }));
  const hourData = s.hours.map(h => ({
    key: String(h.hour),
    label: hourLabel(h.hour),
    value: h.count,
    tooltip: `${hourLabel(h.hour)}: ${h.count} ${h.count === 1 ? 'order' : 'orders'}`,
  }));

  const ratings = reviews.map(r => Math.min(5, Math.max(1, Math.round(Number(r.rating)) || 5)));
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const soldOut = menuItems.filter(i => i.soldOut).length;

  const kpi = (label, value, sub, onClick) => (
    <div
      onClick={onClick}
      className={`bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 ${onClick ? 'cursor-pointer hover:bg-[#fffaf0]' : ''}`}
    >
      <p className="f-cond uppercase tracking-widest text-xs">{label}</p>
      <p className="f-slab text-3xl mt-2 break-words">{value}</p>
      <p className="text-xs text-[#3a1a0b]/60 mt-1">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="f-slab text-3xl">DASHBOARD</h2>
          <p className="text-sm text-[#3a1a0b]/70 mt-1">How the restaurant is doing. Revenue counts served orders only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map(r => (
            <Chip key={r.id} active={rangeDays === r.id} onClick={() => setRangeDays(r.id)}>{r.label}</Chip>
          ))}
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi('Orders placed', s.placed, `${s.servedCount} served · ${rangeLabel}`)}
        {kpi('Revenue', fmtMoney(s.revenue), `from ${s.servedCount} served ${s.servedCount === 1 ? 'order' : 'orders'}`)}
        {kpi('Average order', fmtMoney(s.avg), 'per served order')}
        {kpi('Active now', s.activeCount, s.activeCount ? 'open Live orders →' : 'nothing waiting', () => goTab('orders'))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card
          className="lg:col-span-2"
          title={metric === 'revenue' ? 'Revenue per day' : 'Orders per day'}
          subtitle={`Last ${s.days.length} days`}
          right={
            <div className="flex gap-2">
              <Chip active={metric === 'revenue'} onClick={() => setMetric('revenue')}>Revenue</Chip>
              <Chip active={metric === 'orders'} onClick={() => setMetric('orders')}>Orders</Chip>
            </div>
          }
        >
          <BarChart data={dayData} format={metric === 'revenue' ? (n) => Math.round(n).toLocaleString('en-US') : (n) => String(Math.round(n * 10) / 10)} />
          <button
            onClick={() => setShowTable(v => !v)}
            className="f-cond uppercase tracking-widest text-xs underline"
          >
            {showTable ? 'Hide table' : 'Show as table'}
          </button>
          {showTable && (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="f-cond uppercase tracking-widest text-xs border-b border-[#3a1a0b]/20">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.days].reverse().map(d => (
                    <tr key={d.key} className="border-b border-[#3a1a0b]/10">
                      <td className="py-1.5 pr-4">{dayFull(d)}</td>
                      <td className="py-1.5 pr-4">{d.orders}</td>
                      <td className="py-1.5">{fmtMoney(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Orders by status" subtitle={`Orders placed · ${rangeLabel}`}>
          <HBarList
            emptyText="No orders in this period."
            rows={s.placed === 0 ? [] : STAGE_LABELS.map((label, i) => ({
              label,
              value: s.stageCounts[i],
              right: String(s.stageCounts[i]),
              color: STAGE_COLORS[i],
            }))}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Top dishes" subtitle={`By quantity ordered · ${rangeLabel}`}>
          <HBarList
            emptyText="No dishes ordered in this period."
            rows={s.topDishes.map(d => ({
              label: d.name,
              value: d.qty,
              right: `${d.qty} · ${fmtMoney(d.revenue)}`,
            }))}
          />
        </Card>

        <Card title="Busiest hours" subtitle={`Orders by hour of day · ${rangeLabel}`}>
          <BarChart data={hourData} format={(n) => String(Math.round(n * 10) / 10)} />
        </Card>

        <Card title="Waiting longest" subtitle="Orders not yet served">
          {s.waiting.length === 0 ? (
            <p className="text-sm text-[#3a1a0b]/60 py-6 text-center">No orders waiting. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {s.waiting.slice(0, 5).map(o => {
                const st = getStage(o.status);
                const late = o.ageMin >= 15 && st < 3;
                return (
                  <li
                    key={o.id}
                    onClick={() => goTab('orders')}
                    className="flex items-center justify-between gap-3 text-sm cursor-pointer hover:bg-[#fffaf0] -mx-2 px-2 py-1.5"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="f-cond uppercase text-base">{o.tableName}</span>
                      <span className={`f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 ${stageBadge(st)}`}>{STAGE_LABELS[st]}</span>
                    </span>
                    <span className={`flex items-center gap-1 whitespace-nowrap ${late ? 'text-[#d92b2b] font-semibold' : 'text-[#3a1a0b]/70'}`}>
                      <Clock className="w-3.5 h-3.5" /> {o.ageMin} min{late ? ' · late' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick snapshot of the rest of the system */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 cursor-pointer hover:bg-[#fffaf0]" onClick={() => goTab('robot')}>
          <p className="f-cond uppercase tracking-widest text-xs">Robot</p>
          <p className="f-slab text-2xl mt-2">{robot.battery}%</p>
          <p className="text-xs text-[#3a1a0b]/60 mt-1">
            battery · load {robotWeight}g ({robotWeight >= weightLimit ? 'ready' : 'empty'}) ·{' '}
            <span className={robot.roadblock ? 'text-[#d92b2b] font-semibold' : ''}>{robot.roadblock ? 'path blocked' : 'path clear'}</span>
          </p>
        </div>
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 cursor-pointer hover:bg-[#fffaf0]" onClick={() => goTab('reviews')}>
          <p className="f-cond uppercase tracking-widest text-xs">Reviews</p>
          <p className="f-slab text-2xl mt-2">{ratings.length ? `${avgRating.toFixed(1)} ★` : '–'}</p>
          <p className="text-xs text-[#3a1a0b]/60 mt-1">{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</p>
        </div>
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 cursor-pointer hover:bg-[#fffaf0]" onClick={() => goTab('newsletter')}>
          <p className="f-cond uppercase tracking-widest text-xs">Newsletter</p>
          <p className="f-slab text-2xl mt-2">{subscribers.length}</p>
          <p className="text-xs text-[#3a1a0b]/60 mt-1">{subscribers.length === 1 ? 'subscriber' : 'subscribers'}</p>
        </div>
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-5 cursor-pointer hover:bg-[#fffaf0]" onClick={() => goTab('menu')}>
          <p className="f-cond uppercase tracking-widest text-xs">Menu</p>
          <p className="f-slab text-2xl mt-2">{menuItems.length}</p>
          <p className="text-xs text-[#3a1a0b]/60 mt-1">dishes · {soldOut} sold out</p>
        </div>
      </div>
    </div>
  );
}

// Past records: every order, searchable by date, table, dish
function HistoryTab({ orders, onDelete }) {
  const [scope, setScope] = useState('served'); // 'served' | 'all'
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [table, setTable] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new'); // 'new' | 'old' | 'high'
  const [visible, setVisible] = useState(20);

  const setQuick = (days) => {
    if (days === 0) {
      setFrom('');
      setTo('');
    } else {
      setFrom(dayKey(daysAgoStart(days - 1)));
      setTo(dayKey(Date.now()));
    }
    setVisible(20);
  };

  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : 0;
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  const ql = q.trim().toLowerCase();

  const rows = orders
    .filter(o => {
      const st = getStage(o.status);
      if (scope === 'served' && st !== 4) return false;
      const t = orderTime(o);
      if (t < fromTs || t > toTs) return false;
      if (table && o.tableName !== table) return false;
      if (ql) {
        const hay = `${o.tableName || ''} ${orderNo(o)} ${(o.items || []).map(it => `${it.name} ${it.note || ''}`).join(' ')}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'old') return orderTime(a) - orderTime(b);
      if (sort === 'high') return orderTotal(b) - orderTotal(a);
      return orderTime(b) - orderTime(a);
    });

  const servedRows = rows.filter(o => getStage(o.status) === 4);
  const revenue = servedRows.reduce((sum, o) => sum + orderTotal(o), 0);
  const changed = scope !== 'served' || from || to || table || q || sort !== 'new';

  const reset = () => {
    setScope('served');
    setFrom('');
    setTo('');
    setTable('');
    setQ('');
    setSort('new');
    setVisible(20);
  };

  const exportCsv = () => {
    const header = ['Order no.', 'Date', 'Time', 'Table', 'Items', 'Notes', 'Total (LKR)', 'Status'];
    const body = rows.map(o => {
      const d = new Date(orderTime(o));
      const notes = (o.items || []).filter(it => it.note).map(it => `${it.name}: ${it.note}`).join('; ');
      return [
        orderNo(o),
        orderTime(o) ? d.toLocaleDateString('en-GB') : '',
        orderTime(o) ? d.toLocaleTimeString() : '',
        o.tableName,
        itemsSummary(o),
        notes,
        orderTotal(o),
        STAGE_LABELS[getStage(o.status)],
      ];
    });
    downloadCsv(`orders-history-${dayKey(Date.now())}.csv`, [header, ...body]);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="f-slab text-3xl">ORDER HISTORY</h2>
          <p className="text-sm text-[#3a1a0b]/70 mt-1">Past records. By default only served orders are listed.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className={`${btnRed} flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Download className="w-4 h-4" /> Download CSV
        </button>
      </div>

      <div className="bg-white border border-[#3a1a0b]/15 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="f-cond uppercase tracking-widest text-xs mr-1">Quick range</span>
          <Chip active={false} onClick={() => setQuick(1)}>Today</Chip>
          <Chip active={false} onClick={() => setQuick(7)}>7 days</Chip>
          <Chip active={false} onClick={() => setQuick(30)}>30 days</Chip>
          <Chip active={!from && !to} onClick={() => setQuick(0)}>All time</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setVisible(20); }} className={`${inp} !w-auto`} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setVisible(20); }} className={`${inp} !w-auto`} />
          </label>
          <select value={table} onChange={(e) => { setTable(e.target.value); setVisible(20); }} className={`${inp} !w-auto`}>
            <option value="">All tables</option>
            {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={scope} onChange={(e) => { setScope(e.target.value); setVisible(20); }} className={`${inp} !w-auto`}>
            <option value="served">Served orders only</option>
            <option value="all">All orders</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inp} !w-auto`}>
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="high">Highest total</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3a1a0b]/50" />
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setVisible(20); }}
              placeholder="Search table, order no., dish or note…"
              className={`${inp} pl-9`}
            />
          </div>
          {changed && (
            <button onClick={reset} className="f-cond uppercase tracking-widest text-xs flex items-center gap-1.5 underline">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-4">
          <p className="f-cond uppercase tracking-widest text-xs">Orders found</p>
          <p className="f-slab text-2xl mt-1">{rows.length}</p>
        </div>
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-4">
          <p className="f-cond uppercase tracking-widest text-xs">Revenue (served)</p>
          <p className="f-slab text-2xl mt-1 break-words">{fmtMoney(revenue)}</p>
        </div>
        <div className="bg-white border-t-4 border-[#3a1a0b] shadow-sm p-4">
          <p className="f-cond uppercase tracking-widest text-xs">Average order</p>
          <p className="f-slab text-2xl mt-1 break-words">{fmtMoney(servedRows.length ? revenue / servedRows.length : 0)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-[#3a1a0b]/60 border-2 border-dashed border-[#3a1a0b]/20">
          <p className="text-sm">No orders match these filters.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="f-cond uppercase tracking-widest text-xs bg-[#3a1a0b] text-[#f2b632]">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date &amp; time</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visible).map(o => {
                const st = getStage(o.status);
                return (
                  <tr key={o.id} className="border-t border-[#3a1a0b]/10 align-top">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">#{orderNo(o)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {orderTime(o) ? (
                        <>
                          {new Date(orderTime(o)).toLocaleDateString('en-GB')}
                          <span className="block text-xs text-[#3a1a0b]/60">{new Date(orderTime(o)).toLocaleTimeString()}</span>
                        </>
                      ) : '–'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{o.tableName}</td>
                    <td className="px-4 py-3 min-w-[220px]">
                      {(o.items || []).map((it, i) => (
                        <div key={i}>
                          {it.qty} × {it.name}
                          {it.note && <span className="block text-xs italic text-[#d92b2b]">“{it.note}”</span>}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{fmtMoney(orderTotal(o))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`f-cond uppercase tracking-widest text-[10px] px-2 py-1 ${stageBadge(st)}`}>{STAGE_LABELS[st]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDelete(o.id)}
                        className="p-1.5 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > visible && (
        <div className="text-center">
          <button onClick={() => setVisible(v => v + 20)} className={btnLine}>
            Show more ({rows.length - visible} left)
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');

  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [robotWeight, setRobotWeight] = useState(0);
  // Live orders filters
  const [liveStatus, setLiveStatus] = useState('active'); // 'active' | 'all' | '0'..'4'
  const [liveTable, setLiveTable] = useState('');
  const [liveNotesOnly, setLiveNotesOnly] = useState(false);
  const [liveSearch, setLiveSearch] = useState('');
  const [liveSort, setLiveSort] = useState('newest'); // 'newest' | 'oldest'
  const WEIGHT_LIMIT = 200;

  const [robotStatusData, setRobotStatusData] = useState({
    battery: 0,
    assignedTable: 'None',
    location: 'Charging Dock',
    roadblock: false,
    status: 'IDLE'
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [foodForm, setFoodForm] = useState(EMPTY_FOOD);
  const [customTag, setCustomTag] = useState('');
  const [alertMessage, setAlertMessage] = useState(''); // Custom Alert Modal State
  const [reviews, setReviews] = useState([]);
  const [subscribers, setSubscribers] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!user) return;

    const ordersRef = ref(db, 'orders');
    const unsubscribeOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setOrders(list.reverse());
      } else {
        setOrders([]);
      }
    });

    const menuRef = ref(db, 'menu');
    const unsubscribeMenu = onValue(menuRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMenuItems(list);
      } else {
        setMenuItems([]);
      }
    });

    const weightRef = ref(db, 'robotStatus/currentWeight');
    const unsubscribeWeight = onValue(weightRef, (snapshot) => {
      const weight = snapshot.val();
      setRobotWeight(weight !== null ? Number(weight) : 0);
    });

    const robotStatusRef = ref(db, 'robotStatus');
    const unsubscribeRobotStatus = onValue(robotStatusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRobotStatusData({
          battery: data.battery || 0,
          assignedTable: data.assignedTable || 'None',
          location: data.location || 'Charging Dock',
          roadblock: data.roadblock || false,
          status: data.status || 'IDLE'
        });
      }
    });

    const reviewsRef = ref(db, 'reviews');
    const unsubscribeReviews = onValue(reviewsRef, (snapshot) => {
      const data = snapshot.val();
      setReviews(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse() : []);
    });

    const newslettersRef = ref(db, 'newsletters');
    const unsubscribeNewsletters = onValue(newslettersRef, (snapshot) => {
      const data = snapshot.val();
      setSubscribers(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse() : []);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeMenu();
      unsubscribeWeight();
      unsubscribeRobotStatus();
      unsubscribeReviews();
      unsubscribeNewsletters();
    };
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setLoginError('Invalid email or password. Access denied.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdvanceOrder = async (order) => {
    const stage = getStage(order.status);
    const action = NEXT_ACTION[stage];
    if (!action) return;

    const isDispatch = action.status === 'CONFIRMED & DISPATCHED';

    if (isDispatch && robotWeight < WEIGHT_LIMIT) {
      setAlertMessage(`⚠️ Cannot dispatch! Robot weight sensor reads ${robotWeight}g. Please place the food package onto the robot container first (Required min: ${WEIGHT_LIMIT}g).`);
      return;
    }

    try {
      const updates = { [`orders/${order.id}/status`]: action.status };
      if (isDispatch) {
        updates['robotStatus/assignedTable'] = order.tableName;
        updates['robotStatus/status'] = ROBOT_DISPATCH_STATUS;
        updates['robotStatus/currentOrderId'] = order.id;
      }
      await update(ref(db), updates);
    } catch (err) {
      console.error(err);
      setAlertMessage('Failed to update order status.');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await remove(ref(db, `orders/${orderId}`));
      } catch (err) {
        console.error(err);
        setAlertMessage('Failed to delete order.');
      }
    }
  };

  const handleSaveFood = async (e) => {
    e.preventDefault();
    if (!foodForm.name || !foodForm.price) {
      setAlertMessage('Please fill out name and price.');
      return;
    }

    const { id, ...payload } = foodForm;
    payload.tags = normalizeTags(payload.tags);
    payload.soldOut = !!payload.soldOut;

    try {
      if (editingFood) {
        await update(ref(db, `menu/${editingFood.id}`), payload);
      } else {
        const newFoodRef = push(ref(db, 'menu'));
        await set(newFoodRef, payload);
      }
      setIsModalOpen(false);
      setEditingFood(null);
      setFoodForm(EMPTY_FOOD);
      setCustomTag('');
    } catch (err) {
      console.error(err);
      setAlertMessage('Failed to save food item.');
    }
  };

  const handleToggleSoldOut = async (item) => {
    try {
      await update(ref(db, `menu/${item.id}`), { soldOut: !item.soldOut });
    } catch (err) {
      console.error(err);
      setAlertMessage('Failed to update item.');
    }
  };

  const handleDeleteFood = async (id) => {
    if (window.confirm('Are you sure you want to delete this menu item?')) {
      try {
        await remove(ref(db, `menu/${id}`));
      } catch (err) {
        console.error(err);
        setAlertMessage('Failed to delete item.');
      }
    }
  };

  const handleDeleteReview = async (id) => {
    if (window.confirm('Delete this review?')) {
      try {
        await remove(ref(db, `reviews/${id}`));
      } catch (err) {
        console.error(err);
        setAlertMessage('Failed to delete review.');
      }
    }
  };

  const handleDeleteSubscriber = async (id) => {
    if (window.confirm('Remove this subscriber?')) {
      try {
        await remove(ref(db, `newsletters/${id}`));
      } catch (err) {
        console.error(err);
        setAlertMessage('Failed to remove subscriber.');
      }
    }
  };

  // Download subscribers as a CSV file (cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas)
  const downloadSubscribers = () => {
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [['Email', 'Date of birth', 'Signed up']].concat(
      subscribers.map(s => [s.email, s.dob, s.timestamp ? new Date(s.timestamp).toLocaleString() : ''])
    );
    const csv = rows.map(r => r.map(cell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newsletter-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFoodTag = (tag) => {
    setFoodForm(f => {
      const tags = normalizeTags(f.tags);
      return { ...f, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  };

  const addCustomTag = () => {
    const t = customTag.trim().toLowerCase().replace(/[^a-z0-9\- ]/g, '').replace(/\s+/g, ' ').slice(0, 20);
    if (!t) return;
    setFoodForm(f => {
      const tags = normalizeTags(f.tags);
      return tags.includes(t) ? f : { ...f, tags: [...tags, t] };
    });
    setCustomTag('');
  };

  const allTagOptions = [...new Set([
    ...TAG_OPTIONS,
    ...menuItems.flatMap(i => normalizeTags(i.tags)),
    ...normalizeTags(foodForm.tags),
  ])];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f3ecdd] flex items-center justify-center text-[#3a1a0b]">
        <Fonts />
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f2b632] text-[#3a1a0b] f-body flex items-center justify-center p-4">
        <Fonts />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-t-8 border-[#3a1a0b] p-8 max-w-md w-full space-y-6 shadow-2xl"
        >
          <div className="space-y-2">
            <div className="w-11 h-11 rounded-full bg-[#3a1a0b] flex items-center justify-center text-[#f2b632]">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="f-slab text-3xl">ADMIN LOGIN</h1>
            <p className="text-sm text-[#3a1a0b]/70">Udarata Bistro kitchen &amp; staff panel</p>
          </div>

          {loginError && (
            <div className="p-3 bg-[#d92b2b]/10 border border-[#d92b2b]/40 text-[#b82020] text-sm font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={lbl}>Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#3a1a0b]/50 absolute left-3 top-3.5" />
                <input
                  type="email"
                  required
                  placeholder="admin@udaratabistro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inp} pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#3a1a0b]/50 absolute left-3 top-3.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inp} pl-10`}
                />
              </div>
            </div>

            <button type="submit" className={`${btnRed} w-full`}>Log in</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => getStage(o.status) < 4);

  const statusFilters = [
    { id: 'active', label: 'Active', count: activeOrders.length },
    { id: 'all', label: 'All', count: orders.length },
    ...STAGE_LABELS.map((label, i) => ({
      id: String(i),
      label,
      count: orders.filter(o => getStage(o.status) === i).length,
    })),
  ];

  const liveQuery = liveSearch.trim().toLowerCase();
  const shownOrders = orders
    .filter(o => {
      const st = getStage(o.status);
      if (liveStatus === 'active' && st === 4) return false;
      if (/^[0-4]$/.test(liveStatus) && st !== Number(liveStatus)) return false;
      if (liveTable && o.tableName !== liveTable) return false;
      if (liveNotesOnly && !o.items?.some(it => it.note)) return false;
      if (liveQuery) {
        const hay = `${o.tableName || ''} ${orderNo(o)} ${(o.items || []).map(it => `${it.name} ${it.note || ''}`).join(' ')}`.toLowerCase();
        if (!hay.includes(liveQuery)) return false;
      }
      return true;
    })
    .sort((a, b) => (liveSort === 'oldest' ? orderTime(a) - orderTime(b) : orderTime(b) - orderTime(a)));

  const liveFiltersChanged = liveStatus !== 'active' || liveTable || liveNotesOnly || liveSearch || liveSort !== 'newest';
  const resetLiveFilters = () => {
    setLiveStatus('active');
    setLiveTable('');
    setLiveNotesOnly(false);
    setLiveSearch('');
    setLiveSort('newest');
  };
  const tabClass = (tab) => `f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-4 py-2.5 border-2 transition-colors whitespace-nowrap ${
    activeTab === tab
      ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]'
      : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
  }`;

  return (
    <div className="min-h-screen bg-[#f3ecdd] text-[#3a1a0b] f-body print:bg-white">
      <Fonts />

      <header className="bg-[#3a1a0b] text-white sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#f2b632] flex items-center justify-center text-[#3a1a0b]">
              <Shield className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <h1 className="f-cond uppercase tracking-wide text-lg font-semibold text-[#f2b632]">Kitchen &amp; Admin</h1>
              <p className="text-[11px] text-white/60">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs f-cond uppercase tracking-wider ${
              robotWeight >= WEIGHT_LIMIT ? 'bg-[#2e7d32] text-white' : 'bg-[#f2b632] text-[#3a1a0b]'
            }`}>
              <Scale className="w-4 h-4" />
              Robot load {robotWeight}g · {robotWeight >= WEIGHT_LIMIT ? 'ready' : 'empty'}
            </div>
            <button
              onClick={handleLogout}
              className="f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-3 py-2 border border-white/30 hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
          <button onClick={() => setActiveTab('dashboard')} className={tabClass('dashboard')}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </button>
          <button onClick={() => setActiveTab('orders')} className={tabClass('orders')}>
            <ClipboardList className="w-4 h-4" /> Live orders ({activeOrders.length})
          </button>
          <button onClick={() => setActiveTab('history')} className={tabClass('history')}>
            <HistoryIcon className="w-4 h-4" /> History
          </button>
          <button onClick={() => setActiveTab('robot')} className={tabClass('robot')}>
            <Navigation className="w-4 h-4" /> Robot
          </button>
          <button onClick={() => setActiveTab('menu')} className={tabClass('menu')}>
            <Utensils className="w-4 h-4" /> Foods ({menuItems.length})
          </button>
          <button onClick={() => setActiveTab('qr')} className={tabClass('qr')}>
            <QrCode className="w-4 h-4" /> Table QR codes
          </button>
          <button onClick={() => setActiveTab('reviews')} className={tabClass('reviews')}>
            <Star className="w-4 h-4" /> Reviews ({reviews.length})
          </button>
          <button onClick={() => setActiveTab('newsletter')} className={tabClass('newsletter')}>
            <Mail className="w-4 h-4" /> Newsletter ({subscribers.length})
          </button>
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-5">
            <div className="bg-[#f2b632]/30 border border-[#f2b632] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>The robot can only be dispatched when the load sensor reads <strong>{WEIGHT_LIMIT}g or more</strong>.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="sm:hidden f-cond uppercase tracking-wider text-xs">Load {robotWeight}g</span>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-[#3a1a0b]/15 p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {statusFilters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setLiveStatus(f.id)}
                    className={`f-cond uppercase tracking-widest text-xs px-3.5 py-1.5 rounded-full border-2 transition-colors ${
                      liveStatus === f.id
                        ? 'bg-[#3a1a0b] border-[#3a1a0b] text-[#f2b632]'
                        : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                    }`}
                  >
                    {f.label} <span className="opacity-70">({f.count})</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3a1a0b]/50" />
                  <input
                    type="text"
                    value={liveSearch}
                    onChange={(e) => setLiveSearch(e.target.value)}
                    placeholder="Search table, order no., dish or note…"
                    className={`${inp} pl-9`}
                  />
                </div>
                <select value={liveTable} onChange={(e) => setLiveTable(e.target.value)} className={`${inp} !w-auto`}>
                  <option value="">All tables</option>
                  {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={liveSort} onChange={(e) => setLiveSort(e.target.value)} className={`${inp} !w-auto`}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={liveNotesOnly}
                    onChange={(e) => setLiveNotesOnly(e.target.checked)}
                    className="w-4 h-4 accent-[#d92b2b]"
                  />
                  Has notes only
                </label>
                {liveFiltersChanged && (
                  <button onClick={resetLiveFilters} className="f-cond uppercase tracking-widest text-xs flex items-center gap-1.5 underline">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#3a1a0b]/60">Showing {shownOrders.length} of {orders.length} orders</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {shownOrders.length === 0 ? (
                <div className="col-span-full text-center py-16 text-[#3a1a0b]/60 space-y-2 border-2 border-dashed border-[#3a1a0b]/20">
                  <ClipboardList className="w-9 h-9 mx-auto opacity-40" />
                  <p className="text-sm">{liveFiltersChanged ? 'No orders match these filters.' : 'No orders right now.'}</p>
                </div>
              ) : (
                shownOrders.map((order) => {
                  const stage = getStage(order.status);
                  const action = NEXT_ACTION[stage];
                  const hasNotes = order.items?.some(it => it.note);
                  const isDispatchStep = action?.status === 'CONFIRMED & DISPATCHED';
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white border-t-4 shadow-sm p-5 space-y-4 flex flex-col justify-between ${
                        stage === 4 ? 'border-[#3a1a0b]/30 opacity-60' : hasNotes ? 'border-[#d92b2b]' : 'border-[#3a1a0b]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="f-slab text-2xl leading-none">{order.tableName}</p>
                            {order.timestamp && (
                              <p className="text-xs text-[#3a1a0b]/60 mt-1">#{orderNo(order)} · {new Date(order.timestamp).toLocaleTimeString()}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`f-cond uppercase tracking-widest text-[11px] px-2.5 py-1 ${stageBadge(stage)}`}>
                              {STAGE_LABELS[stage]}
                            </span>
                            {hasNotes && (
                              <span className="f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 bg-[#d92b2b] text-white">
                                Has notes
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 border-t border-dashed border-[#3a1a0b]/30 pt-3">
                          {order.items && order.items.map((item, idx) => (
                            <div key={idx} className="text-sm">
                              <div className="flex justify-between">
                                <span>{item.qty} × {item.name}</span>
                                <span className="text-[#3a1a0b]/60">LKR {item.price * item.qty}</span>
                              </div>
                              {item.note && (
                                <p className="mt-1 px-2 py-1 bg-[#f2b632]/40 border-l-4 border-[#d92b2b] text-xs font-semibold">
                                  NOTE: {item.note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-dashed border-[#3a1a0b]/30 pt-4 space-y-3">
                        <div className="flex justify-between items-baseline">
                          <span className="f-cond uppercase tracking-widest text-xs">Total</span>
                          <span className="f-slab text-xl text-[#d92b2b]">LKR {order.total}</span>
                        </div>

                        <div className="flex gap-2">
                          {action && (
                            <button
                              onClick={() => handleAdvanceOrder(order)}
                              className={`flex-1 flex items-center justify-center gap-2 ${isDispatchStep ? btnRed : btnBrown}`}
                            >
                              {isDispatchStep ? <Navigation className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                              {action.label}
                            </button>
                          )}
                          {stage === 4 && (
                            <div className="flex-1 py-3 text-xs flex items-center justify-center gap-1.5 text-[#3a1a0b]/60">
                              <CheckCircle className="w-4 h-4" /> Served · table is free
                            </div>
                          )}
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="px-3 border-2 border-[#d92b2b]/40 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                            title="Delete order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            orders={orders}
            menuItems={menuItems}
            reviews={reviews}
            subscribers={subscribers}
            robot={robotStatusData}
            robotWeight={robotWeight}
            weightLimit={WEIGHT_LIMIT}
            goTab={setActiveTab}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab orders={orders} onDelete={handleDeleteOrder} />
        )}

        {activeTab === 'robot' && (
          <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
              <div>
                <h2 className="f-slab text-3xl">ROBOT STATUS</h2>
                <p className="text-sm text-[#3a1a0b]/70 mt-1">Live readings from the delivery robot.</p>
              </div>
              <span className="f-cond uppercase tracking-widest text-xs flex items-center gap-2 px-3 py-1.5 bg-[#2e7d32] text-white">
                <Wifi className="w-3.5 h-3.5" /> Live
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Battery</span>
                  <Battery className="w-5 h-5" />
                </div>
                <p className="f-slab text-4xl">{robotStatusData.battery}%</p>
                <p className={`text-xs font-semibold ${robotStatusData.battery > 20 ? 'text-[#2e7d32]' : 'text-[#d92b2b]'}`}>
                  {robotStatusData.battery > 20 ? 'Good' : 'Low power'}
                </p>
              </div>

              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Going to</span>
                  <Navigation className="w-5 h-5" />
                </div>
                <p className="f-slab text-3xl">{robotStatusData.assignedTable}</p>
                <p className="text-xs font-semibold text-[#3a1a0b]/70">{robotStatusData.status}</p>
              </div>

              <div className="bg-white border-t-4 border-[#3a1a0b] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Location</span>
                  <MapPin className="w-5 h-5" />
                </div>
                <p className="f-slab text-2xl leading-tight">{robotStatusData.location}</p>
              </div>

              <div className={`bg-white border-t-4 p-5 space-y-2 ${robotStatusData.roadblock ? 'border-[#d92b2b]' : 'border-[#2e7d32]'}`}>
                <div className="flex items-center justify-between">
                  <span className="f-cond uppercase tracking-widest text-xs">Path</span>
                  {robotStatusData.roadblock
                    ? <AlertTriangle className="w-5 h-5 text-[#d92b2b]" />
                    : <CheckCircle className="w-5 h-5 text-[#2e7d32]" />}
                </div>
                <p className={`f-slab text-2xl ${robotStatusData.roadblock ? 'text-[#d92b2b]' : 'text-[#2e7d32]'}`}>
                  {robotStatusData.roadblock ? 'BLOCKED' : 'CLEAR'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h2 className="f-slab text-3xl">MENU</h2>
              <button
                onClick={() => { setEditingFood(null); setFoodForm(EMPTY_FOOD); setCustomTag(''); setIsModalOpen(true); }}
                className={`${btnRed} flex items-center gap-2`}
              >
                <Plus className="w-4 h-4" /> Add food item
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {menuItems.map((item) => (
                <div key={item.id} className={`bg-white shadow-sm flex flex-col justify-between ${item.soldOut ? 'opacity-70' : ''}`}>
                  <div>
                    <div className="h-40 bg-[#e4dccb] relative overflow-hidden">
                      <img src={item.image} alt={item.name} className={`w-full h-full object-cover ${item.soldOut ? 'grayscale' : ''}`} />
                      <span className="absolute top-3 right-3 f-cond uppercase tracking-widest text-[10px] px-2 py-1 bg-white">
                        {item.category}
                      </span>
                      {item.soldOut && (
                        <span className="absolute top-3 left-3 f-cond uppercase tracking-widest text-[10px] px-2 py-1 bg-[#d92b2b] text-white">
                          Sold out
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-1.5">
                      <h3 className="f-cond uppercase text-lg">{item.name}</h3>
                      <p className="text-xs text-[#3a1a0b]/65 line-clamp-2">{item.desc}</p>
                      {normalizeTags(item.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {normalizeTags(item.tags).map(t => (
                            <span key={t} className="f-cond uppercase tracking-widest text-[10px] px-2 py-0.5 bg-[#f2b632]/50">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="f-slab text-lg text-[#d92b2b] pt-1">LKR {item.price}</p>
                    </div>
                  </div>

                  <div className="p-4 pt-3 flex gap-2 border-t border-dashed border-[#3a1a0b]/25">
                    <button onClick={() => handleToggleSoldOut(item)} className={`${btnLine} flex-1 !px-2`}>
                      {item.soldOut ? 'Available' : 'Sold out'}
                    </button>
                    <button
                      onClick={() => { setEditingFood(item); setFoodForm({ ...EMPTY_FOOD, ...item, tags: normalizeTags(item.tags), soldOut: !!item.soldOut }); setCustomTag(''); setIsModalOpen(true); }}
                      className={`${btnLine} flex items-center gap-1.5`}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteFood(item.id)}
                      className="px-3 border-2 border-[#d92b2b]/40 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-5">
            <div>
              <h2 className="f-slab text-3xl">REVIEWS</h2>
              <p className="text-sm text-[#3a1a0b]/70 mt-1">Reviews appear on the customer site straight away. Delete anything inappropriate.</p>
            </div>

            {reviews.length === 0 ? (
              <div className="text-center py-16 text-[#3a1a0b]/60 border-2 border-dashed border-[#3a1a0b]/20">
                <p className="text-sm">No reviews yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.map((rev) => {
                  const stars = Math.min(5, Math.max(1, Math.round(Number(rev.rating)) || 5));
                  return (
                    <div key={rev.id} className="bg-white border-l-4 border-[#d92b2b] shadow-sm p-5 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="f-cond uppercase text-base font-semibold break-words">{rev.name}</p>
                          <p className="text-xs text-[#3a1a0b]/50">{rev.timestamp ? new Date(rev.timestamp).toLocaleString() : ''}</p>
                        </div>
                        <div className="flex flex-shrink-0">
                          {[...Array(stars)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-[#f2b632] fill-[#f2b632]" />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-[#3a1a0b]/80 italic break-words">"{rev.comment}"</p>
                      <div className="pt-2 border-t border-dashed border-[#3a1a0b]/25">
                        <button
                          onClick={() => handleDeleteReview(rev.id)}
                          className="f-cond uppercase tracking-widest text-xs flex items-center gap-1.5 px-3 py-2 border-2 border-[#d92b2b]/40 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'newsletter' && (
          <div className="space-y-5">
            <div className="flex justify-between items-end flex-wrap gap-3">
              <div>
                <h2 className="f-slab text-3xl">NEWSLETTER</h2>
                <p className="text-sm text-[#3a1a0b]/70 mt-1">People who signed up on the customer site. Keep this list private.</p>
              </div>
              <button
                onClick={downloadSubscribers}
                disabled={subscribers.length === 0}
                className={`${btnRed} flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>

            {subscribers.length === 0 ? (
              <div className="text-center py-16 text-[#3a1a0b]/60 border-2 border-dashed border-[#3a1a0b]/20">
                <p className="text-sm">No subscribers yet.</p>
              </div>
            ) : (
              <div className="bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="f-cond uppercase tracking-widest text-xs bg-[#3a1a0b] text-[#f2b632]">
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Date of birth</th>
                      <th className="px-4 py-3">Signed up</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((s) => (
                      <tr key={s.id} className="border-t border-[#3a1a0b]/10">
                        <td className="px-4 py-3 break-all">{s.email}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{s.dob}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#3a1a0b]/60">
                          {s.timestamp ? new Date(s.timestamp).toLocaleDateString() : ''}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteSubscriber(s.id)}
                            className="p-1.5 text-[#d92b2b] hover:bg-[#d92b2b] hover:text-white transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'qr' && (
          <div className="space-y-5">
            <div className="flex justify-between items-end flex-wrap gap-3 print:hidden">
              <div>
                <h2 className="f-slab text-3xl">TABLE QR CODES</h2>
                <p className="text-sm text-[#3a1a0b]/70 mt-1">
                  Each code opens the menu with that table already selected. Print one for every table.
                </p>
              </div>
              <button onClick={() => window.print()} className={`${btnRed} flex items-center gap-2`}>
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {TABLES.map(table => {
                const link = `${window.location.origin}/?table=${encodeURIComponent(table)}`;
                const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(link)}`;
                return (
                  <div key={table} className="bg-white border-2 border-[#3a1a0b] p-5 text-center space-y-3 break-inside-avoid">
                    <p className="f-slab text-2xl">{table}</p>
                    <img src={qrSrc} alt={`QR code for ${table}`} className="w-full max-w-[200px] mx-auto" />
                    <p className="f-cond uppercase tracking-widest text-xs">Scan to see the menu &amp; order</p>
                    <p className="text-[10px] text-[#3a1a0b]/50 break-all print:hidden">{link}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* Add / Edit Food Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 print:hidden">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white border-t-8 border-[#f2b632] max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="f-slab text-2xl">{editingFood ? 'EDIT FOOD' : 'NEW FOOD'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-[#3a1a0b]/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFood} className="space-y-4">
                <div>
                  <label className={lbl}>Food name</label>
                  <input
                    type="text"
                    required
                    value={foodForm.name}
                    onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
                    className={inp}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Price (LKR)</label>
                    <input
                      type="number"
                      required
                      value={foodForm.price}
                      onChange={(e) => setFoodForm({ ...foodForm, price: Number(e.target.value) })}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Category</label>
                    <select
                      value={foodForm.category}
                      onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
                      className={inp}
                    >
                      <option value="Mains">Mains</option>
                      <option value="Appetizers">Appetizers</option>
                      <option value="Beverages">Beverages</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={lbl}>Image URL</label>
                  <input
                    type="text"
                    value={foodForm.image}
                    onChange={(e) => setFoodForm({ ...foodForm, image: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className={`${inp} text-xs`}
                  />
                </div>

                <div>
                  <label className={lbl}>Description</label>
                  <textarea
                    rows="3"
                    value={foodForm.desc}
                    onChange={(e) => setFoodForm({ ...foodForm, desc: e.target.value })}
                    className={inp}
                  />
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <label className={lbl}>Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {allTagOptions.map(tag => {
                      const on = normalizeTags(foodForm.tags).includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => toggleFoodTag(tag)}
                          className={`f-cond uppercase tracking-widest text-xs px-3.5 py-1.5 rounded-full border-2 transition-colors ${
                            on
                              ? 'bg-[#d92b2b] border-[#d92b2b] text-white'
                              : 'border-[#3a1a0b]/25 hover:border-[#3a1a0b]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                      placeholder="New tag, e.g. gluten-free"
                      maxLength={20}
                      className={`${inp} flex-1`}
                    />
                    <button type="button" onClick={addCustomTag} className={`${btnBrown} flex items-center gap-1.5`}>
                      <Plus className="w-3.5 h-3.5" /> Add tag
                    </button>
                  </div>
                  <p className="text-[11px] text-[#3a1a0b]/60">
                    New tags appear as filter buttons on the customer menu once a dish uses them.
                  </p>
                </div>

                {/* Sold out */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!foodForm.soldOut}
                    onChange={(e) => setFoodForm({ ...foodForm, soldOut: e.target.checked })}
                    className="w-4 h-4 accent-[#d92b2b]"
                  />
                  <span className="text-sm">Mark as sold out (customers can't order it)</span>
                </label>

                <div className="pt-1 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className={`${btnLine} flex-1`}>
                    Cancel
                  </button>
                  <button type="submit" className={`${btnRed} flex-1 flex items-center justify-center gap-2`}>
                    <Save className="w-4 h-4" /> Save item
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM ALERT MODAL */}
      <AnimatePresence>
        {alertMessage && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border-t-8 border-[#d92b2b] max-w-sm w-full p-6 space-y-4 shadow-2xl rounded-lg text-center"
            >
              <div className="w-12 h-12 bg-[#d92b2b]/10 rounded-full flex items-center justify-center mx-auto text-[#d92b2b]">
                <AlertIcon className="w-6 h-6" />
              </div>
              <h3 className="f-slab text-xl text-[#3a1a0b]">Notice</h3>
              <p className="text-sm text-[#3a1a0b]/80 leading-relaxed font-medium">
                {alertMessage}
              </p>
              <button
                onClick={() => setAlertMessage('')}
                className="w-full py-2.5 bg-[#3a1a0b] text-[#f2b632] f-cond uppercase tracking-widest text-xs hover:bg-[#2a1208] transition-colors"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}