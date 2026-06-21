import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MagnifyingGlassIcon, XMarkIcon, ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');
const PAGE_SIZE = 20;

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface BulkJob {
  _id: string; bulkFileName: string; bulkZipUrl?: string;
  carrier: string; vendorName: string; portal?: string;
  totalLabels: number; totalPrice: number;
  generatedCount: number; failedCount: number;
  trackingIds: string[];
  createdAt: string;
  user?: { _id: string; firstName: string; lastName: string; email: string };
}

const CARRIER_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', accent: '#D97706' },
};

function jobStatus(job: BulkJob) {
  if (job.failedCount === 0)    return 'success';
  if (job.generatedCount === 0) return 'failed';
  return 'partial';
}
const STATUS_CFG = {
  success: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Complete' },
  partial: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Partial'  },
  failed:  { bg: '#FFF5F5', color: '#DC2626', border: '#FECACA', label: 'Failed'   },
};

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };

export default function CCBulkLabels() {
  const { token } = useAuth();

  const [jobs,        setJobs]        = useState<BulkJob[]>([]);
  const [total,       setTotal]       = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);

  const [search,      setSearch]      = useState('');
  const [carrier,     setCarrier]     = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchJobs = useCallback(() => {
    setLoading(true);
    const p: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (search)   p.search   = search;
    if (carrier)  p.carrier  = carrier;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo)   p.dateTo   = dateTo;

    axios.get(`${API_BASE}/labels/bulk-jobs`, { headers: authH(), params: p })
      .then(r => {
        setJobs(r.data.jobs || []);
        setTotal(r.data.total || 0);
        setTotalPages(r.data.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, carrier, dateFrom, dateTo, authH]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const toggleExpand = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const downloadZip = async (job: BulkJob) => {
    if (!job.bulkZipUrl) return;
    setDownloading(job._id);
    try {
      const r = await axios.get(job.bulkZipUrl, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a   = document.createElement('a');
      a.href = url; a.download = `${job.bulkFileName}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
    setDownloading(null);
  };

  const openTrack = (carrier: string, ids: string[]) => {
    const chunks = chunkArray(ids.filter(Boolean), 35);
    chunks.forEach(chunk => {
      const enc = encodeURIComponent(chunk.join(','));
      const url = carrier === 'UPS'   ? `https://www.ups.com/track?tracknum=${enc}` :
                  carrier === 'FedEx' ? `https://www.fedex.com/fedextrack/?trknbr=${enc}` :
                  `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
      window.open(url, '_blank');
    });
  };

  const hasFilters = search || carrier || dateFrom || dateTo;
  const clearFilters = () => { setSearch(''); setCarrier(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Bulk Batches</h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              {total.toLocaleString()} batches
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>All users' bulk upload batches</div>
        </div>
        <button onClick={fetchJobs} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
          <ArrowPathIcon style={{ width: 14, height: 14 }} /> Refresh
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 200 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search file name…" style={{ ...inp, paddingLeft: 30, width: '100%' }} />
          </div>
          <div style={{ position: 'relative' }}>
            <select value={carrier} onChange={e => { setCarrier(e.target.value); setPage(1); }} style={{ ...inp, cursor: 'pointer', paddingRight: '1.8rem', appearance: 'none' as const, minWidth: 130 }}>
              <option value="">All Carriers</option>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={{ ...inp, width: 138 }} />
          <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} style={{ ...inp, width: 138 }} />
          {hasFilters && (
            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 0.75rem', height: 34, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <XMarkIcon style={{ width: 13, height: 13 }} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Job list ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1rem' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="db-card" style={{ height: 72, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-50) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 100}ms` }} />
          ))
        ) : jobs.length === 0 ? (
          <div className="db-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
            No batches found{hasFilters ? ' — try adjusting filters' : ''}
          </div>
        ) : (
          jobs.map(job => {
            const st    = jobStatus(job);
            const sCfg  = STATUS_CFG[st];
            const cCfg  = CARRIER_STYLE[job.carrier] || { bg: '#F8FAFC', color: '#475569', accent: '#94A3B8' };
            const isExp = expanded.has(job._id);
            const isDl  = downloading === job._id;
            const valIds= job.trackingIds?.filter(Boolean) || [];

            return (
              <div key={job._id} className="db-card" style={{ overflow: 'hidden' }}>
                {/* Row */}
                <div onClick={() => toggleExpand(job._id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 1.1rem', cursor: 'pointer', position: 'relative' }}>
                  {/* carrier bar */}
                  <div style={{ width: 3, alignSelf: 'stretch', background: cCfg.accent, borderRadius: '0 2px 2px 0', flexShrink: 0, position: 'absolute', left: 0, top: 0, bottom: 0 }} />
                  <div style={{ marginLeft: 6, flexGrow: 1, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                    {/* File name */}
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.bulkFileName || 'Unnamed batch'}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>
                        {job.user ? `${job.user.firstName} ${job.user.lastName}` : '—'} · {timeAgo(job.createdAt)}
                      </div>
                    </div>
                    {/* Carrier */}
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: cCfg.bg, color: cCfg.color, border: `1px solid ${cCfg.accent}30`, whiteSpace: 'nowrap' }}>
                      {job.carrier}
                    </span>
                    {/* Vendor */}
                    <span style={{ fontSize: '0.76rem', color: 'var(--navy-600)', whiteSpace: 'nowrap' }}>{job.vendorName}</span>
                    {/* Count */}
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap' }}>{job.totalLabels.toLocaleString()} labels</span>
                    {/* Price */}
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-700)', whiteSpace: 'nowrap' }}>${job.totalPrice.toFixed(2)}</span>
                    {/* Status */}
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: sCfg.bg, color: sCfg.color, border: `1px solid ${sCfg.border}`, whiteSpace: 'nowrap' }}>{sCfg.label}</span>
                  </div>
                  {/* Actions */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {valIds.length > 0 && (
                      <button onClick={() => openTrack(job.carrier, valIds)} title="Track all" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.35rem 0.65rem', borderRadius: 7, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                        <ArrowTopRightOnSquareIcon style={{ width: 12, height: 12 }} /> Track
                      </button>
                    )}
                    {job.bulkZipUrl && (
                      <button onClick={() => downloadZip(job)} disabled={isDl} title="Download ZIP" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.35rem 0.65rem', borderRadius: 7, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', fontSize: '0.72rem', fontWeight: 600, cursor: isDl ? 'wait' : 'pointer', fontFamily: FONT }}>
                        <ArrowDownTrayIcon style={{ width: 12, height: 12 }} /> {isDl ? '…' : 'ZIP'}
                      </button>
                    )}
                  </div>
                  {isExp ? <ChevronUpIcon style={{ width: 15, height: 15, color: 'var(--navy-400)', flexShrink: 0 }} /> : <ChevronDownIcon style={{ width: 15, height: 15, color: 'var(--navy-400)', flexShrink: 0 }} />}
                </div>

                {/* Expanded: progress + tracking IDs */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.85rem 1.1rem 0.85rem 1.5rem', background: 'var(--navy-50)' }}>
                    {/* Progress bar */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-600)' }}>Label generation</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{job.generatedCount} / {job.totalLabels}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--navy-200)', overflow: 'hidden' }}>
                        <div style={{ width: `${job.totalLabels > 0 ? (job.generatedCount / job.totalLabels) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg,#10B981,#34D399)', transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.7rem' }}>
                        <span style={{ color: '#059669', fontWeight: 700 }}>{job.generatedCount} generated</span>
                        {job.failedCount > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>{job.failedCount} failed</span>}
                      </div>
                    </div>
                    {/* Tracking IDs preview */}
                    {valIds.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Tracking IDs (first 10)</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {valIds.slice(0, 10).map(id => (
                            <a key={id} href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#6366f1', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 5, padding: '2px 6px', textDecoration: 'none' }}>
                              {id}
                            </a>
                          ))}
                          {valIds.length > 10 && <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', padding: '2px 4px' }}>+{valIds.length - 10} more</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--navy-400)' }}>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page > 1 ? 'pointer' : 'not-allowed', color: page > 1 ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page < totalPages ? 'pointer' : 'not-allowed', color: page < totalPages ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
