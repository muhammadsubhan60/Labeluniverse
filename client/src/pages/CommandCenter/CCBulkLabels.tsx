import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MagnifyingGlassIcon, XMarkIcon, ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon, ArrowPathIcon,
  ChevronLeftIcon, ChevronRightIcon,
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
const thBase: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' };

export default function CCBulkLabels() {
  const { token } = useAuth();

  const [jobs,       setJobs]       = useState<BulkJob[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);

  const [search,   setSearch]   = useState('');
  const [carrier,  setCarrier]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

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
    chunkArray(ids.filter(Boolean), 35).forEach(chunk => {
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

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
            <thead>
              <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                <th style={thBase}>Batch</th>
                <th style={thBase}>Carrier</th>
                <th style={thBase}>Vendor</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Total</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Generated</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Failed</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Price</th>
                <th style={thBase}>Status</th>
                <th style={thBase}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 80}ms` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
                    No batches found{hasFilters ? ' — try adjusting filters' : ''}
                  </td>
                </tr>
              ) : (
                jobs.map(job => {
                  const st   = jobStatus(job);
                  const sCfg = STATUS_CFG[st];
                  const cCfg = CARRIER_STYLE[job.carrier] || { bg: '#F8FAFC', color: '#475569', accent: '#94A3B8' };
                  const isDl = downloading === job._id;
                  const valIds = job.trackingIds?.filter(Boolean) || [];

                  return (
                    <tr key={job._id} style={{ borderBottom: '1px solid var(--navy-100)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Batch name + user + time */}
                      <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.bulkFileName || 'Unnamed batch'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          {timeAgo(job.createdAt)}
                        </div>
                      </td>

                      {/* Carrier */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: cCfg.bg, color: cCfg.color, border: `1px solid ${cCfg.accent}30`, whiteSpace: 'nowrap' }}>
                          {job.carrier}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td style={{ padding: '10px 12px', color: 'var(--navy-600)', fontSize: '0.76rem', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.vendorName || '—'}
                      </td>

                      {/* Total */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--navy-800)' }}>
                        {job.totalLabels.toLocaleString()}
                      </td>

                      {/* Generated */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                        {job.generatedCount.toLocaleString()}
                      </td>

                      {/* Failed */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: job.failedCount > 0 ? '#dc2626' : 'var(--navy-300)' }}>
                        {job.failedCount > 0 ? job.failedCount.toLocaleString() : '—'}
                      </td>

                      {/* Price */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--navy-700)', whiteSpace: 'nowrap' }}>
                        ${job.totalPrice.toFixed(2)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: sCfg.bg, color: sCfg.color, border: `1px solid ${sCfg.border}`, whiteSpace: 'nowrap' }}>
                          {sCfg.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {valIds.length > 0 && (
                            <button onClick={() => openTrack(job.carrier, valIds)} title="Track all" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.6rem', borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                              <ArrowTopRightOnSquareIcon style={{ width: 11, height: 11 }} /> Track
                            </button>
                          )}
                          {job.bulkZipUrl && (
                            <button onClick={() => downloadZip(job)} disabled={isDl} title="Download ZIP" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', fontSize: '0.7rem', fontWeight: 600, cursor: isDl ? 'wait' : 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                              <ArrowDownTrayIcon style={{ width: 11, height: 11 }} /> {isDl ? '…' : 'ZIP'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
