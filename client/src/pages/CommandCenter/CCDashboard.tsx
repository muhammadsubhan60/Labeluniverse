import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  TagIcon, TruckIcon, ExclamationTriangleIcon,
  CheckCircleIcon, CalendarDaysIcon,
  ArrowUpRightIcon, ClockIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

// ── Tracking status display config ────────────────────────────
const TS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_scanned_yet:    { label: 'Not Scanned',       color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_transit:         { label: 'In Transit',         color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  out_for_delivery:   { label: 'Out for Delivery',   color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  delivered:          { label: 'Delivered',           color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  exception_problem:  { label: 'Exception',          color: '#dc2626', bg: '#fff5f5', border: '#fecaca' },
  returned_to_sender: { label: 'Returned',           color: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
  pending_pickup:     { label: 'Pending Pickup',     color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  delayed:            { label: 'Delayed',             color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  voided:             { label: 'Voided',              color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
};

// ── Period helpers ─────────────────────────────────────────────
type Period = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'last_year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',           label: 'All Time'      },
  { key: 'this_month',    label: 'This Month'    },
  { key: 'last_month',    label: 'Last Month'    },
  { key: 'this_quarter',  label: 'This Quarter'  },
  { key: 'this_year',     label: 'This Year'     },
  { key: 'last_year',     label: 'Last Year'     },
];

function getPeriodRange(p: Period): { from?: string; to?: string } {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const fmt   = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'all')         return {};
  if (p === 'this_month')  return { from: fmt(new Date(y, m, 1)),     to: fmt(now) };
  if (p === 'last_month')  return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (p === 'this_quarter'){
    const qs = Math.floor(m / 3) * 3;
    return { from: fmt(new Date(y, qs, 1)), to: fmt(now) };
  }
  if (p === 'this_year')   return { from: fmt(new Date(y, 0, 1)),     to: fmt(now) };
  if (p === 'last_year')   return { from: fmt(new Date(y - 1, 0, 1)), to: fmt(new Date(y - 1, 11, 31)) };
  return {};
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface AdminStats {
  labels: { total: number; generated: number; failed: number; revenue: number; today: number; byCarrier: Record<string, number> };
  trackingStatus: {
    not_scanned_yet: number; in_transit: number; out_for_delivery: number; delivered: number;
    exception_problem: number; returned_to_sender: number; pending_pickup: number; delayed: number; voided: number;
  };
}

interface CcLabel {
  _id: string; trackingId: string; carrier: string; isBulk: boolean; vendorName: string;
  from_name: string; from_city: string; from_state: string;
  to_name: string; to_city: string; to_state: string;
  trackingStatus?: string; price: number; createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

// ── Sub-components ─────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, Icon }: {
  label: string; value: string | number; sub?: string; color: string; Icon: React.ElementType;
}) => (
  <div className="db-card" style={{ padding: '1.1rem 1.2rem', position: 'relative', overflow: 'hidden', fontFamily: FONT }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '16px 16px 0 0' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
    </div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    {sub && <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const StatusBadge = ({ ts }: { ts?: string }) => {
  const cfg = TS[ts || 'not_scanned_yet'] || TS.not_scanned_yet;
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', fontFamily: FONT }}>
      {cfg.label}
    </span>
  );
};

export default function CCDashboard() {
  const { token } = useAuth();
  const navigate  = useNavigate();
  const [period,   setPeriod]   = useState<Period>('this_month');
  const [stats,    setStats]    = useState<AdminStats | null>(null);
  const [recent,   setRecent]   = useState<CcLabel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showDrop, setShowDrop] = useState(false);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodRange(period);
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to)   params.to   = to;

    Promise.all([
      axios.get(`${API_BASE}/stats`, { headers: authH(), params }),
      axios.get(`${API_BASE}/labels/cc-all`, { headers: authH(), params: { limit: '8' } }),
    ])
      .then(([sRes, lRes]) => {
        setStats(sRes.data);
        setRecent(lRes.data.labels || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, authH]);

  const ts        = stats?.trackingStatus;
  const delivered = ts?.delivered         ?? 0;
  const inTransit = ts?.in_transit        ?? 0;
  const exceptions= ts?.exception_problem ?? 0;
  const notScanned= ts?.not_scanned_yet   ?? 0;
  const outForDel = ts?.out_for_delivery  ?? 0;
  const returned  = ts?.returned_to_sender?? 0;
  const pending   = ts?.pending_pickup    ?? 0;
  const delayed   = ts?.delayed           ?? 0;
  const total     = stats?.labels.total   ?? 0;

  const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const periodLabel  = PERIODS.find(p => p.key === period)?.label ?? 'This Month';

  const attention = [
    { key: 'exception_problem',   label: 'Exceptions',        count: exceptions, color: '#dc2626', ts: 'exception_problem'   },
    { key: 'returned_to_sender',  label: 'Returned',          count: returned,   color: '#be123c', ts: 'returned_to_sender'  },
    { key: 'pending_pickup',      label: 'Pending Pickup',    count: pending,    color: '#c2410c', ts: 'pending_pickup'      },
    { key: 'delayed',             label: 'Delayed',           count: delayed,    color: '#92400e', ts: 'delayed'             },
  ].filter(a => a.count > 0);

  const statusBars = [
    { key: 'delivered',          label: 'Delivered',         count: delivered, color: '#22c55e' },
    { key: 'in_transit',         label: 'In Transit',        count: inTransit, color: '#3b82f6' },
    { key: 'out_for_delivery',   label: 'Out for Delivery',  count: outForDel, color: '#8b5cf6' },
    { key: 'not_scanned_yet',    label: 'Not Scanned',       count: notScanned,color: '#94a3b8' },
    { key: 'exception_problem',  label: 'Exception',         count: exceptions,color: '#ef4444' },
    { key: 'returned_to_sender', label: 'Returned',          count: returned,  color: '#f43f5e' },
    { key: 'pending_pickup',     label: 'Pending Pickup',    count: pending,   color: '#f97316' },
    { key: 'delayed',            label: 'Delayed',           count: delayed,   color: '#eab308' },
  ].filter(b => b.count > 0);

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1300, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>
              Dashboard
            </h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              All Users
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>
            Aggregated across all users · {periodLabel}
          </div>
        </div>

        {/* Period picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDrop(d => !d)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)',
              color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT,
            }}
          >
            <CalendarDaysIcon style={{ width: 14, height: 14 }} />
            {periodLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showDrop && (
            <>
              <div onClick={() => setShowDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
              <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 10, minWidth: 160, overflow: 'hidden' }}>
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => { setPeriod(p.key); setShowDrop(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 1rem', background: period === p.key ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: period === p.key ? 700 : 400, color: period === p.key ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="db-card" style={{ height: 110, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-50) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── KPI cards ────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <KpiCard label="Total Labels"   value={total.toLocaleString()}     color="#6366f1"  Icon={TagIcon}                  sub={`${stats?.labels.generated ?? 0} generated`} />
            <KpiCard label="Delivered"      value={delivered.toLocaleString()} color="#22c55e"  Icon={CheckCircleIcon}           sub={`${deliveryRate}% delivery rate`} />
            <KpiCard label="In Transit"     value={inTransit.toLocaleString()} color="#3b82f6"  Icon={TruckIcon}                 sub={`${outForDel} out for delivery`} />
            <KpiCard label="Exceptions"     value={exceptions.toLocaleString()}color="#ef4444"  Icon={ExclamationTriangleIcon}   sub={`${returned} returned`} />
            <KpiCard label="Not Scanned"    value={notScanned.toLocaleString()}color="#94a3b8"  Icon={ClockIcon}                 sub={`${pending} pending pickup`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

            {/* ── Status breakdown ─────────────────────────────── */}
            <div className="db-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                <div style={{ width: 3, height: 13, borderRadius: 3, background: '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Status Breakdown</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {statusBars.map(b => (
                  <div key={b.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 500, color: 'var(--navy-700)' }}>{b.label}</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-900)' }}>{b.count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--navy-100)', overflow: 'hidden' }}>
                      <div style={{ width: total > 0 ? `${(b.count / total) * 100}%` : '0%', height: '100%', background: b.color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                ))}
                {statusBars.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-400)', fontSize: '0.8rem' }}>No data for this period</div>
                )}
              </div>
            </div>

            {/* ── Attention required ───────────────────────────── */}
            <div className="db-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                <div style={{ width: 3, height: 13, borderRadius: 3, background: '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Attention Required</span>
              </div>
              {attention.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '1.5rem 0' }}>
                  <CheckCircleIcon style={{ width: 28, height: 28, color: '#22c55e' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#22c55e' }}>All clear</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>No issues requiring attention</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {attention.map(a => (
                    <button
                      key={a.key}
                      onClick={() => navigate(`/command-center/labels?trackingStatus=${a.ts}`)}
                      style={{ padding: '0.9rem', borderRadius: 10, background: `${a.color}0d`, border: `1.5px solid ${a.color}22`, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: a.color, lineHeight: 1 }}>{a.count.toLocaleString()}</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: a.color, marginTop: 3 }}>{a.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Recent labels ─────────────────────────────────── */}
          <div className="db-card" style={{ padding: '1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 3, height: 13, borderRadius: 3, background: '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Recent Activity</span>
              </div>
              <button
                onClick={() => navigate('/command-center/labels')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: '#6366f1', fontFamily: FONT }}
              >
                View all <ArrowUpRightIcon style={{ width: 13, height: 13 }} />
              </button>
            </div>

            {recent.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-400)', fontSize: '0.8rem' }}>No recent labels</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sh-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      {['Tracking ID', 'Type', 'Vendor', 'To', 'Status', 'Owner', 'Date'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--navy-100)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(l => (
                      <tr key={l._id} style={{ borderBottom: '1px solid var(--navy-100)' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--navy-700)', whiteSpace: 'nowrap' }}>
                          {l.trackingId?.slice(0, 20)}{l.trackingId?.length > 20 ? '…' : ''}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: l.isBulk ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)', color: l.isBulk ? '#6366f1' : '#15803d', border: `1px solid ${l.isBulk ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
                            {l.isBulk ? 'Bulk' : 'Single'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--navy-700)', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>{l.vendorName || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--navy-600)', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>{l.to_name}, {l.to_state}</td>
                        <td style={{ padding: '8px 10px' }}><StatusBadge ts={l.trackingStatus} /></td>
                        <td style={{ padding: '8px 10px', color: 'var(--navy-600)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {l.user ? `${l.user.firstName} ${l.user.lastName}` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--navy-400)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{timeAgo(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
