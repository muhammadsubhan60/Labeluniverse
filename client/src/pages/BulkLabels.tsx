import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  MagnifyingGlassIcon, ArrowDownTrayIcon, RectangleStackIcon,
  XMarkIcon, TruckIcon, CalendarDaysIcon, ArrowRightIcon,
  ChevronLeftIcon, ChevronRightIcon, CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

// ── Tracking helpers ──────────────────────────────────────────
const BATCH_SIZE = 35;

function getTrackUrl(carrier: string, ids: string[]): string {
  const joined = encodeURIComponent(ids.join(','));
  if (carrier === 'UPS')   return `https://www.ups.com/track?tracknum=${joined}`;
  if (carrier === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${joined}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${joined}`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await axios.get(url, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) { console.error('Download failed', e); }
}

// ── Types ─────────────────────────────────────────────────────
interface BulkJob {
  _id: string;
  bulkFileName: string;
  bulkZipUrl?: string;
  carrier: string;
  vendorName: string;
  portal?: string;
  totalLabels: number;
  totalPrice: number;
  generatedCount: number;
  failedCount: number;
  trackingIds: string[];
  createdAt: string;
  user?: { _id: string; firstName: string; lastName: string; email: string };
}
interface Vendor { _id: string; name: string; carrier: string; }

// ── Carrier theme ─────────────────────────────────────────────
const CC: Record<string, { bg: string; color: string; border: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', border: '#FDE68A', accent: '#D97706' },
};
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

// ── Portal theme ──────────────────────────────────────────────
const PORTALS: { id: string; label: string; bg: string; color: string; border: string }[] = [
  { id: 'shippershub', label: 'ShippersHub', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  { id: 'labelcrow',   label: 'Label Crow',  bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  { id: 'shiplabel',   label: 'ShipLabel',   bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
];

// ── Status badge ──────────────────────────────────────────────
function jobStatus(job: BulkJob) {
  if (job.failedCount === 0)    return 'success';
  if (job.generatedCount === 0) return 'failed';
  return 'partial';
}

const StatusBadge: React.FC<{ job: BulkJob }> = ({ job }) => {
  const st = jobStatus(job);
  const cfg = {
    success: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Complete' },
    partial: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Partial'  },
    failed:  { bg: '#FFF5F5', color: '#DC2626', border: '#FECACA', label: 'Failed'   },
  }[st];
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '2px 10px', fontSize: '0.67rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {st === 'success'
          ? <CheckCircleIcon style={{ width: 10, height: 10 }} />
          : <ExclamationTriangleIcon style={{ width: 10, height: 10 }} />}
        {cfg.label}
      </span>
      <span style={{ fontSize: '0.63rem', color: 'var(--navy-400)', paddingLeft: 4 }}>
        {job.generatedCount}/{job.totalLabels} labels
      </span>
    </div>
  );
};

// ── Skeleton row ──────────────────────────────────────────────
const SkeletonRow = () => (
  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
    {[50, 140, 160, 90, 80, 90, 90, 110, 120, 90].map((w, i) => (
      <td key={i} style={{ padding: '1rem 0.875rem' }}>
        <div style={{ height: 10, width: w, borderRadius: 5, background: 'linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        {(i === 1 || i === 2) && <div style={{ height: 8, width: w * 0.6, borderRadius: 4, background: '#F1F5F9', marginTop: 5 }} />}
      </td>
    ))}
  </tr>
);

// ── Main component ────────────────────────────────────────────
const BulkLabels: React.FC = () => {
  const [jobs,       setJobs]       = useState<BulkJob[]>([]);
  const [vendors,    setVendors]    = useState<Vendor[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search,         setSearch]         = useState('');
  const [carrier,        setCarrier]        = useState('');
  const [vendorId,       setVendorId]       = useState('');
  const [portal,         setPortal]         = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // UI
  const [downloading, setDownloading] = useState<string | null>(null);

  const LIMIT = 15;
  const filteredVendors = carrier ? vendors.filter(v => v.carrier === carrier) : vendors;
  const hasFilters = !!(carrier || vendorId || portal || dateFrom || dateTo);
  const totalSpent = jobs.reduce((s, j) => s + (j.totalPrice || 0), 0);

  useEffect(() => {
    axios.get('/vendors').then(r => setVendors(r.data.vendors || [])).catch(() => {});
  }, []);

  const fetchJobs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: String(LIMIT) };
      if (search)   params.search   = search;
      if (carrier)  params.carrier  = carrier;
      if (vendorId) params.vendorId = vendorId;
      if (portal)   params.portal   = portal;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;
      const res = await axios.get('/labels/bulk-jobs', { params });
      setJobs(res.data.jobs || []);
      setTotalPages(res.data.totalPages || 1);
      setTotalCount(res.data.total || 0);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, carrier, vendorId, portal, dateFrom, dateTo]);

  useEffect(() => { fetchJobs(1); }, [fetchJobs]);

  const handleDownloadZip = async (job: BulkJob) => {
    setDownloading(job._id);
    const filename = (job.bulkFileName || job._id).replace(/\.[^.]+$/, '') + '.zip';
    try {
      if (job.bulkZipUrl) {
        const url = job.bulkZipUrl.replace(/^\/api\//, '/');
        await downloadFile(url, filename);
      } else {
        await downloadFile(`/labels/zip/bulk/${job._id}`, filename);
      }
    } finally {
      setDownloading(null);
    }
  };

  const resetFilters = () => {
    setCarrier(''); setVendorId(''); setPortal(''); setDateFrom(''); setDateTo('');
    setSearch(''); setShowDateFilter(false);
  };

  // Pagination page numbers
  const pageNums = (() => {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);
    if (range[0] > 1)                           { range.unshift(-1); range.unshift(1); }
    if (range[range.length - 1] < totalPages)   { range.push(-2); range.push(totalPages); }
    return range;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', flexShrink: 0 }}>
            <RectangleStackIcon style={{ width: 20, height: 20, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.02em' }}>Bulk Labels</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--navy-500)', margin: '2px 0 0', fontWeight: 500 }}>
              All bulk-uploaded label jobs and their shipments
            </p>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, padding: '6px 14px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1' }} />
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Total Jobs</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{totalCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 10, padding: '6px 14px' }}>
            <CurrencyDollarIcon style={{ width: 13, height: 13, color: '#16A34A' }} />
            <span style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>Page spend</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#15803D' }}>${totalSpent.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>

        {/* Top row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--navy-100)' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchJobs(1)}
              placeholder="Search file name, user…"
              style={{ width: '100%', boxSizing: 'border-box', height: 36, paddingLeft: 32, paddingRight: 12, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--navy-50)', transition: 'border-color 0.15s' }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
            />
          </div>

          {/* Vendor filter */}
          {filteredVendors.length > 0 && (
            <select
              value={vendorId}
              onChange={e => { setVendorId(e.target.value); fetchJobs(1); }}
              style={{ height: 36, paddingLeft: 10, paddingRight: 28, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--navy-50)', cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16 }}>
              <option value="">All Vendors</option>
              {filteredVendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
          )}

          <button
            onClick={() => setShowDateFilter(o => !o)}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: `1.5px solid ${showDateFilter || dateFrom || dateTo ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 8, background: showDateFilter || dateFrom || dateTo ? '#EEF2FF' : 'var(--navy-50)', color: showDateFilter || dateFrom || dateTo ? '#4F46E5' : 'var(--navy-500)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            <CalendarDaysIcon style={{ width: 13, height: 13 }} />
            Date
            {(dateFrom || dateTo) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />}
          </button>

          {hasFilters && (
            <button
              onClick={resetFilters}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1.5px solid #FCA5A5', borderRadius: 8, background: '#FFF5F5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <XMarkIcon style={{ width: 12, height: 12 }} /> Clear
            </button>
          )}
        </div>

        {/* Carrier tabs */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.875rem', borderBottom: '1px solid var(--navy-100)', overflowX: 'auto' }}>
          {['', ...CARRIERS].map(c => {
            const active = carrier === c;
            const theme  = c ? CC[c] : null;
            return (
              <button
                key={c || 'all'}
                onClick={() => { setCarrier(c); setVendorId(''); fetchJobs(1); }}
                style={{ padding: '0.5rem 0.875rem', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? (theme?.color ?? '#4F46E5') : 'var(--navy-500)', borderBottom: `2px solid ${active ? (theme?.accent ?? '#6366f1') : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', marginBottom: -1 }}>
                {c || 'All Carriers'}
              </button>
            );
          })}
        </div>

        {/* Portal filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.875rem', borderBottom: '1px solid var(--navy-100)', overflowX: 'auto' }}>
          <span style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', marginRight: 4 }}>Portal</span>
          {[{ id: '', label: 'All' }, ...PORTALS].map(p => {
            const active = portal === p.id;
            const cfg = p.id ? PORTALS.find(x => x.id === p.id) : null;
            return (
              <button
                key={p.id || 'all'}
                onClick={() => { setPortal(p.id); fetchJobs(1); }}
                style={{ padding: '4px 12px', border: `1.5px solid ${active ? (cfg?.border ?? '#6366f1') : 'var(--navy-200)'}`, borderRadius: 20, background: active ? (cfg?.bg ?? '#EEF2FF') : 'var(--navy-50)', color: active ? (cfg?.color ?? '#4F46E5') : 'var(--navy-500)', fontSize: '0.72rem', fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Date range row */}
        {showDateFilter && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--navy-50)' }}>
            <CalendarDaysIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>From</label>
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={e => { setDateFrom(e.target.value); fetchJobs(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none' }} />
              <ArrowRightIcon style={{ width: 12, height: 12, color: 'var(--navy-300)' }} />
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>To</label>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={e => { setDateTo(e.target.value); fetchJobs(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none' }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', padding: 2 }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--navy-50)' }}>
                {['#', 'User', 'Job File', 'Labels', 'Price', 'Vendor', 'Portal', 'Date', 'Status', 'Track', 'Download'].map(h => (
                  <th key={h} style={{ padding: '0.625rem 0.875rem', textAlign: 'left', fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--navy-200)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '4rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RectangleStackIcon style={{ width: 26, height: 26, color: '#CBD5E1' }} />
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>No bulk jobs found</div>
                      <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                        {hasFilters ? 'Try adjusting your filters or clearing them.' : 'Upload a bulk label sheet to get started.'}
                      </div>
                      {hasFilters && (
                        <button onClick={resetFilters} style={{ marginTop: 4, padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map((job, idx) => {
                  const theme  = CC[job.carrier] ?? { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', accent: '#94A3B8' };
                  const rowNum = (page - 1) * LIMIT + idx + 1;
                  const fname  = job.bulkFileName || '—';
                  const validIds = job.trackingIds.filter(Boolean);
                  const batches  = chunkArray(validIds, BATCH_SIZE);

                  return (
                    <tr key={job._id}
                      style={{ borderBottom: '1px solid var(--navy-100)', transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      {/* # */}
                      <td style={{ padding: '1rem 0.875rem 1rem 1rem', width: 48 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 3, height: 40, borderRadius: 2, background: theme.accent, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.7rem', color: '#CBD5E1', fontWeight: 700 }}>{String(rowNum).padStart(2, '0')}</span>
                        </div>
                      </td>

                      {/* User */}
                      <td style={{ padding: '1rem 0.875rem', minWidth: 140 }}>
                        {job.user ? (
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                              {job.user.firstName} {job.user.lastName}
                            </div>
                            <div style={{ fontSize: '0.67rem', color: '#94A3B8', marginTop: 2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.user.email}
                            </div>
                          </div>
                        ) : <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>—</span>}
                      </td>

                      {/* Job File */}
                      <td style={{ padding: '1rem 0.875rem', minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
                            {job.carrier}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#1E293B', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fname}>
                          {fname.length > 28 ? fname.substring(0, 25) + '…' : fname}
                        </div>
                      </td>

                      {/* Labels count */}
                      <td style={{ padding: '1rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>{job.totalLabels}</span>
                          <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 500 }}>labels</span>
                        </div>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '1rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                          ${job.totalPrice.toFixed(2)}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td style={{ padding: '1rem 0.875rem', minWidth: 110 }}>
                        <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.vendorName || '—'}
                        </div>
                      </td>

                      {/* Portal */}
                      <td style={{ padding: '1rem 0.875rem', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const cfg = PORTALS.find(p => p.id === job.portal);
                          if (!cfg) return <span style={{ fontSize: '0.7rem', color: '#CBD5E1' }}>—</span>;
                          return (
                            <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em', display: 'inline-block' }}>
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Date */}
                      <td style={{ padding: '1rem 0.875rem', whiteSpace: 'nowrap', minWidth: 90 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1E293B' }}>
                          {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#94A3B8', marginTop: 1 }}>
                          {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '1rem 0.875rem' }}>
                        <StatusBadge job={job} />
                      </td>

                      {/* Track */}
                      <td style={{ padding: '1rem 0.875rem' }}>
                        {validIds.length === 0 ? (
                          <span style={{ fontSize: '0.7rem', color: '#CBD5E1' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {batches.map((batch, ci) => {
                              const start = ci * BATCH_SIZE + 1;
                              const end   = start + batch.length - 1;
                              return (
                                <a
                                  key={ci}
                                  href={getTrackUrl(job.carrier, batch)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: theme.bg, color: theme.color, border: `1.5px solid ${theme.border}`, borderRadius: 7, padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'filter 0.15s' }}
                                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
                                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                                  <TruckIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
                                  {`${start}–${end}`}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Download ZIP */}
                      <td style={{ padding: '1rem 0.875rem' }}>
                        <button
                          onClick={() => handleDownloadZip(job)}
                          disabled={downloading === job._id}
                          style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', border: `1.5px solid ${downloading === job._id ? '#E2E8F0' : '#6366f1'}`, borderRadius: 8, background: downloading === job._id ? '#F8FAFC' : '#6366f1', color: downloading === job._id ? '#94A3B8' : '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: downloading === job._id ? 'not-allowed' : 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => { if (downloading !== job._id) e.currentTarget.style.background = '#4F46E5'; }}
                          onMouseLeave={e => { if (downloading !== job._id) e.currentTarget.style.background = '#6366f1'; }}>
                          {downloading === job._id ? (
                            <div style={{ width: 12, height: 12, border: '2px solid #CBD5E1', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          ) : (
                            <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                          )}
                          {downloading === job._id ? 'Saving…' : 'Download ZIP'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1.5px solid var(--navy-100)', background: 'var(--navy-50)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 500 }}>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, totalCount)} of <strong style={{ color: 'var(--navy-600)' }}>{totalCount}</strong> jobs
            </span>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <button
                disabled={page <= 1}
                onClick={() => fetchJobs(page - 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #E2E8F0', borderRadius: 7, background: page <= 1 ? '#F8FAFC' : '#fff', color: page <= 1 ? '#CBD5E1' : '#475569', cursor: page <= 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronLeftIcon style={{ width: 13, height: 13 }} />
              </button>

              {pageNums.map((n, i) =>
                n < 0 ? (
                  <span key={i} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#CBD5E1' }}>…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => fetchJobs(n)}
                    style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${n === page ? '#6366f1' : '#E2E8F0'}`, borderRadius: 7, background: n === page ? '#6366f1' : '#fff', color: n === page ? '#fff' : '#475569', fontSize: '0.75rem', fontWeight: n === page ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {n}
                  </button>
                )
              )}

              <button
                disabled={page >= totalPages}
                onClick={() => fetchJobs(page + 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #E2E8F0', borderRadius: 7, background: page >= totalPages ? '#F8FAFC' : '#fff', color: page >= totalPages ? '#CBD5E1' : '#475569', cursor: page >= totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronRightIcon style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default BulkLabels;
