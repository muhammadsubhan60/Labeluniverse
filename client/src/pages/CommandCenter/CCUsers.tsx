import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MagnifyingGlassIcon, ChevronDownIcon, ChevronUpIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface UserRow {
  _id: string; firstName: string; lastName: string; email: string;
  role: string; isActive: boolean;
  labelStats?: {
    total: number; delivered: number; in_transit: number;
    exception_problem: number; not_scanned_yet: number; spent: number;
  };
}

const ROLE_STYLE: Record<string, { color: string; bg: string; border: string; avatarGrad: string }> = {
  admin:    { color: '#dc2626', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   avatarGrad: 'linear-gradient(135deg,#ef4444,#dc2626)' },
  reseller: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)',  avatarGrad: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
  user:     { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)',  avatarGrad: 'linear-gradient(135deg,#64748b,#475569)' },
};

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };
const sel: React.CSSProperties = { ...inp, cursor: 'pointer', paddingRight: '1.8rem', appearance: 'none' as const };

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

export default function CCUsers() {
  const { token } = useAuth();
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [role,     setRole]     = useState('');
  const [period,   setPeriod]   = useState<Period>('this_month');
  const [showDrop, setShowDrop] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [labelMap, setLabelMap] = useState<Record<string, any>>({});
  const [loadingLabels, setLoadingLabels] = useState<Set<string>>(new Set());

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/users`, { headers: authH(), params: { limit: 500 } })
      .then(r => setUsers(r.data.users || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authH]);

  const loadLabelStats = useCallback((userId: string) => {
    if (labelMap[userId] || loadingLabels.has(userId)) return;
    setLoadingLabels(s => new Set(s).add(userId));
    const { from, to } = getPeriodRange(period);
    const params: Record<string, string> = { userId, limit: '1000' };
    if (from) params.dateFrom = from;
    if (to)   params.dateTo   = to;

    axios.get(`${API_BASE}/labels/cc-all`, { headers: authH(), params })
      .then(r => {
        const labels: any[] = r.data.labels || [];
        const stats = {
          total:             r.data.total || 0,
          delivered:         labels.filter(l => l.trackingStatus === 'delivered').length,
          in_transit:        labels.filter(l => l.trackingStatus === 'in_transit').length,
          exception_problem: labels.filter(l => l.trackingStatus === 'exception_problem').length,
          not_scanned_yet:   labels.filter(l => !l.trackingStatus || l.trackingStatus === 'not_scanned_yet').length,
          spent:             labels.reduce((a: number, l: any) => a + (l.price || 0), 0),
        };
        setLabelMap(m => ({ ...m, [userId]: stats }));
      })
      .catch(() => {})
      .finally(() => setLoadingLabels(s => { const n = new Set(s); n.delete(userId); return n; }));
  }, [period, authH, labelMap, loadingLabels]);

  const toggleExpand = (id: string) => {
    setExpanded(s => {
      const n = new Set(s);
      if (n.has(id)) { n.delete(id); } else { n.add(id); loadLabelStats(id); }
      return n;
    });
  };

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? 'This Month';

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    if (q && !`${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)) return false;
    if (role && u.role !== role) return false;
    return true;
  });

  const totalUsers     = users.length;
  const activeUsers    = users.filter(u => u.isActive).length;

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Users</h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              {totalUsers} total
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>
            {activeUsers} active · Expand a row to see label stats
          </div>
        </div>
        {/* Period picker */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowDrop(d => !d)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
            <CalendarDaysIcon style={{ width: 14, height: 14 }} /> {periodLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showDrop && (
            <>
              <div onClick={() => setShowDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
              <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 10, minWidth: 140, overflow: 'hidden' }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setPeriod(p.key); setShowDrop(false); setLabelMap({}); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 1rem', background: period === p.key ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: period === p.key ? 700 : 400, color: period === p.key ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Summary row ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
        {[
          { label: 'Total Users',  value: totalUsers,                                        color: '#6366f1' },
          { label: 'Active',       value: activeUsers,                                        color: '#22c55e' },
          { label: 'Admins',       value: users.filter(u => u.role === 'admin').length,      color: '#ef4444' },
          { label: 'Resellers',    value: users.filter(u => u.role === 'reseller').length,   color: '#8b5cf6' },
          { label: 'Users',        value: users.filter(u => u.role === 'user').length,       color: '#64748b' },
        ].map(c => (
          <div key={c.label} className="db-card" style={{ padding: '0.8rem 1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.8rem 1rem', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 200 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" style={{ ...inp, paddingLeft: 30, width: '100%' }} />
          </div>
          <div style={{ position: 'relative' }}>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...sel, minWidth: 130 }}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="reseller">Reseller</option>
              <option value="user">User</option>
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>
        </div>
      </div>

      {/* ── User list ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="db-card" style={{ height: 64, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-50) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 100}ms` }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="db-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>No users found</div>
        ) : (
          filtered.map(u => {
            const rs    = ROLE_STYLE[u.role] || ROLE_STYLE.user;
            const isExp = expanded.has(u._id);
            const stats = labelMap[u._id];
            const isLoadingStats = loadingLabels.has(u._id);
            const initials = `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase();
            const deliveryRate = stats && stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;

            return (
              <div key={u._id} className="db-card" style={{ overflow: 'hidden' }}>
                {/* User row */}
                <div
                  onClick={() => toggleExpand(u._id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.8rem 1.1rem', cursor: 'pointer' }}
                >
                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: rs.avatarGrad || 'linear-gradient(135deg,#64748b,#475569)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: '0.78rem', fontWeight: 700 }}>
                    {initials || '?'}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.firstName} {u.lastName}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>

                  {/* Role + active */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 99, background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                      {u.role}
                    </span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.isActive ? '#22c55e' : '#94a3b8', display: 'inline-block', flexShrink: 0 }} title={u.isActive ? 'Active' : 'Inactive'} />
                  </div>

                  {/* Quick stats if loaded */}
                  {stats && (
                    <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{stats.total}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)' }}>labels</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{deliveryRate}%</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)' }}>delivery</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--navy-800)', lineHeight: 1 }}>${stats.spent.toFixed(2)}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)' }}>spent</div>
                      </div>
                    </div>
                  )}

                  {isExp
                    ? <ChevronUpIcon   style={{ width: 15, height: 15, color: 'var(--navy-400)', flexShrink: 0 }} />
                    : <ChevronDownIcon style={{ width: 15, height: 15, color: 'var(--navy-400)', flexShrink: 0 }} />}
                </div>

                {/* Expanded stats */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.9rem 1.1rem', background: 'var(--navy-50)' }}>
                    {isLoadingStats ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)' }}>Loading stats for {periodLabel}…</div>
                    ) : !stats ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)' }}>No label data</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '0.75rem' }}>
                        {[
                          { label: 'Total Labels',  value: stats.total,                color: '#6366f1' },
                          { label: 'Delivered',      value: stats.delivered,            color: '#22c55e' },
                          { label: 'Delivery Rate',  value: `${deliveryRate}%`,         color: deliveryRate >= 80 ? '#22c55e' : '#f59e0b' },
                          { label: 'In Transit',     value: stats.in_transit,           color: '#3b82f6' },
                          { label: 'Exception',      value: stats.exception_problem,    color: '#ef4444' },
                          { label: 'Not Scanned',    value: stats.not_scanned_yet,      color: '#94a3b8' },
                          { label: 'Total Spent',    value: `$${stats.spent.toFixed(2)}`, color: '#64748b' },
                        ].map(s => (
                          <div key={s.label} style={{ padding: '0.65rem 0.8rem', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--navy-200)' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--navy-400)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
