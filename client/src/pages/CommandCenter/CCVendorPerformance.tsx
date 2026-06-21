import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

type Tab = 'vendors' | 'daily';

interface VendorStat {
  _id: string; carrier: string; total: number;
  delivered: number; in_transit: number; out_for_delivery: number;
  exception_problem: number; returned_to_sender: number;
  pending_pickup: number; delayed: number; not_scanned_yet: number;
}

interface DayStat {
  _id: string; total: number;
  delivered: number; in_transit: number; out_for_delivery: number;
  exception_problem: number; returned_to_sender: number; not_scanned_yet: number;
}

type Period = 'all' | 'this_month' | 'last_month' | 'this_year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',        label: 'All Time'   },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year',  label: 'This Year'  },
];

function getPeriodRange(p: Period): { from?: string; to?: string } {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'all')        return {};
  if (p === 'this_month') return { from: fmt(new Date(y, m, 1)),     to: fmt(now) };
  if (p === 'last_month') return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (p === 'this_year')  return { from: fmt(new Date(y, 0, 1)),     to: fmt(now) };
  return {};
}

function deliveryRate(v: VendorStat | DayStat): number {
  if (!v.total) return 0;
  return Math.round((v.delivered / v.total) * 100);
}

const CARRIER_COLOR: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};

const RateBar = ({ pct, color = '#6366f1' }: { pct: number; color?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--navy-100)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-700)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
  </div>
);

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };

export default function CCVendorPerformance() {
  const { token } = useAuth();
  const [tab,      setTab]      = useState<Tab>('vendors');
  const [period,   setPeriod]   = useState<Period>('this_month');
  const [showDrop, setShowDrop] = useState(false);
  const [vendors,  setVendors]  = useState<VendorStat[]>([]);
  const [days,     setDays]     = useState<DayStat[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodRange(period);
    const params: Record<string, string> = {};
    if (from) params.dateFrom = from;
    if (to)   params.dateTo   = to;

    const reqs = [
      axios.get(`${API_BASE}/labels/vendor-stats`, { headers: authH(), params }),
    ];
    if (tab === 'daily') {
      reqs.push(axios.get(`${API_BASE}/labels/daily-stats`, { headers: authH(), params }));
    }

    Promise.all(reqs)
      .then(([vr, dr]) => {
        setVendors(vr.data.vendors || []);
        if (dr) setDays(dr.data.days || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, tab, authH]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? 'This Month';

  const filtered = vendors.filter(v =>
    !search || v._id?.toLowerCase().includes(search.toLowerCase())
  );

  const totalLabels    = vendors.reduce((a, v) => a + v.total, 0);
  const totalDelivered = vendors.reduce((a, v) => a + v.delivered, 0);
  const avgRate        = totalLabels > 0 ? Math.round((totalDelivered / totalLabels) * 100) : 0;
  const best           = vendors.reduce((b, v) => deliveryRate(v) > deliveryRate(b) ? v : b, vendors[0]);
  const worst          = vendors.reduce((w, v) => deliveryRate(v) < deliveryRate(w) ? v : w, vendors[0]);

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Vendor Performance</h1>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>Delivery rates + status breakdown by vendor</div>
        </div>
        {/* Period */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowDrop(d => !d)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
            <CalendarDaysIcon style={{ width: 14, height: 14 }} /> {periodLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showDrop && (
            <>
              <div onClick={() => setShowDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
              <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 10, minWidth: 150, overflow: 'hidden' }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setPeriod(p.key); setShowDrop(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 1rem', background: period === p.key ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: period === p.key ? 700 : 400, color: period === p.key ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Vendors',  value: vendors.length,          color: '#6366f1' },
          { label: 'Total Labels',   value: totalLabels.toLocaleString(), color: '#64748b' },
          { label: 'Avg Rate',       value: `${avgRate}%`,           color: '#22c55e'  },
          { label: 'Best Vendor',    value: best ? `${deliveryRate(best)}%` : '—', sub: best?._id, color: '#10b981' },
          { label: 'Lowest Vendor',  value: worst ? `${deliveryRate(worst)}%` : '—', sub: worst?._id, color: '#ef4444' },
        ].map(c => (
          <div key={c.label} className="db-card" style={{ padding: '0.9rem 1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{c.value}</div>
            {'sub' in c && c.sub && <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>}
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--navy-200)', marginBottom: '1.25rem' }}>
        {([['vendors', 'Vendors'], ['daily', 'Daily View']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.6rem 1.2rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: tab === t ? 700 : 500, color: tab === t ? '#6366f1' : 'var(--navy-500)', borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -2, fontFamily: FONT, transition: 'color 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Vendors tab ────────────────────────────────────────── */}
      {tab === 'vendors' && (
        <>
          <div style={{ marginBottom: '0.85rem' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor…" style={{ ...inp, width: 260 }} />
          </div>
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
                <thead>
                  <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                    {['Vendor', 'Carrier', 'Total', 'Delivery Rate', 'In Transit', 'Exception', 'Returned', 'Not Scanned'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} style={{ padding: '10px 12px' }}>
                            <div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)' }}>No vendor data</td></tr>
                  ) : (
                    filtered.map(v => {
                      const rate  = deliveryRate(v);
                      const color = rate >= 90 ? '#22c55e' : rate >= 75 ? '#f59e0b' : '#ef4444';
                      const cColor= CARRIER_COLOR[v.carrier] || '#64748b';
                      return (
                        <tr key={v._id} style={{ borderBottom: '1px solid var(--navy-100)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{v._id || '—'}</div>
                            {rate < 80 && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '1px 5px', borderRadius: 99, marginTop: 2, display: 'inline-block' }}>LOW</span>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cColor, background: `${cColor}15`, border: `1px solid ${cColor}30`, padding: '2px 7px', borderRadius: 5 }}>{v.carrier || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)' }}>{v.total.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', minWidth: 160 }}><RateBar pct={rate} color={color} /></td>
                          <td style={{ padding: '10px 12px', color: '#1d4ed8' }}>{v.in_transit}</td>
                          <td style={{ padding: '10px 12px', color: '#dc2626' }}>{v.exception_problem}</td>
                          <td style={{ padding: '10px 12px', color: '#be123c' }}>{v.returned_to_sender}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--navy-400)' }}>{v.not_scanned_yet}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Daily tab ──────────────────────────────────────────── */}
      {tab === 'daily' && (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                  {['Date', 'Total', 'Delivery Rate', 'Delivered', 'In Transit', 'Out for Delivery', 'Exception', 'Returned', 'Not Scanned'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 9 }).map((_, j) => <td key={j} style={{ padding: '10px 12px' }}><div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite' }} /></td>)}</tr>
                  ))
                ) : days.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)' }}>No daily data</td></tr>
                ) : (
                  days.map(d => {
                    const rate  = deliveryRate(d);
                    const color = rate >= 90 ? '#22c55e' : rate >= 75 ? '#f59e0b' : '#ef4444';
                    const dateLabel = new Date(d._id + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <tr key={d._id} style={{ borderBottom: '1px solid var(--navy-100)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap' }}>{dateLabel}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)' }}>{d.total.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', minWidth: 150 }}><RateBar pct={rate} color={color} /></td>
                        <td style={{ padding: '10px 12px', color: '#15803d', fontWeight: 600 }}>{d.delivered}</td>
                        <td style={{ padding: '10px 12px', color: '#1d4ed8' }}>{d.in_transit}</td>
                        <td style={{ padding: '10px 12px', color: '#6d28d9' }}>{d.out_for_delivery}</td>
                        <td style={{ padding: '10px 12px', color: '#dc2626' }}>{d.exception_problem}</td>
                        <td style={{ padding: '10px 12px', color: '#be123c' }}>{d.returned_to_sender}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--navy-400)' }}>{d.not_scanned_yet}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
