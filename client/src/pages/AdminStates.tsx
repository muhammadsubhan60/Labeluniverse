import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const EXT     = 'https://shippers-hub-tracking-command-cente.vercel.app/api/public';
const EXT_HDR = { 'x-api-key': 'sh-public-2024-gama' };

// ── State lookup tables ───────────────────────────────────────────────────────
const STATE_ABBR: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',
};
const FULL_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([k, v]) => [v, k])
);

function toFull(s: string): string {
  if (!s) return '';
  return STATE_ABBR[s.trim().toUpperCase()] ?? s.trim();
}
function toAbbr(s: string): string {
  if (!s) return '';
  const up = s.trim().toUpperCase();
  if (STATE_ABBR[up]) return up;
  return FULL_TO_ABBR[s.trim()] ?? s.trim().toUpperCase().slice(0, 2);
}

function parseData(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  for (const k of ['data', 'states', 'breakdown', 'topStates']) {
    if (raw[k] && Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

// ── Visual constants ──────────────────────────────────────────────────────────
const BLUE_STOPS = ['#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'];

const fmt  = (n: number) => Math.round(n || 0).toLocaleString();
const fmtR = (n: number) => `${(n || 0).toFixed(1)}%`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface StateRow {
  state:        string;
  total:        number;
  delivered:    number;
  inTransit:    number;
  exception:    number;
  returned:     number;
  notScanned:   number;
  deliveryRate: number;
}

interface TopStateRow {
  state:       string;
  totalLabels: number;
  bestVendor:  string;
  bestRate:    number;
  vendorCount: number;
}

interface VendorRow {
  vendor:       string;
  total:        number;
  delivered:    number;
  inTransit:    number;
  exception:    number;
  returned:     number;
  notScanned:   number;
  deliveryRate: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
const AdminStates: React.FC = () => {
  const { user } = useAuth();

  const [breakdown,     setBreakdown]     = useState<StateRow[]>([]);
  const [topStates,     setTopStates]     = useState<TopStateRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState('');
  const [selected,      setSelected]      = useState<string | null>(null);
  const [vendors,       setVendors]       = useState<VendorRow[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [search,        setSearch]        = useState('');
  const [sortKey,       setSortKey]       = useState<'state'|'total'|'deliveryRate'|'exception'>('total');
  const [sortDir,       setSortDir]       = useState<'asc'|'desc'>('desc');

  const mapRef      = useRef<HTMLDivElement>(null);
  const mapReady    = useRef(false);
  const countMap    = useRef<Record<string, number>>({});
  const selectedRef = useRef<string | null>(null);
  const selectFnRef = useRef<(abbr: string) => void>(() => {});

  selectedRef.current = selected;

  // ── Map helpers ───────────────────────────────────────────────────────────
  const refreshMap = useCallback(() => {
    if (!mapRef.current || !mapReady.current) return;
    const vals  = Object.values(countMap.current);
    const maxV  = vals.length ? Math.max(...vals) : 1;
    const color = d3.scaleQuantize<string>().domain([0, maxV]).range(BLUE_STOPS);
    d3.select(mapRef.current).selectAll<SVGPathElement, any>('path')
      .attr('fill', (d: any) => {
        const v = countMap.current[d?.properties?.name] || 0;
        return v > 0 ? color(v) : '#E2E8F0';
      });
  }, []);

  const highlightMap = useCallback((abbr: string | null) => {
    if (!mapRef.current || !mapReady.current) return;
    d3.select(mapRef.current).selectAll<SVGPathElement, any>('path')
      .attr('stroke', (d: any) =>
        (FULL_TO_ABBR[d?.properties?.name] || '') === abbr ? '#1E40AF' : '#fff')
      .attr('stroke-width', (d: any) =>
        (FULL_TO_ABBR[d?.properties?.name] || '') === abbr ? 2.5 : 0.6);
  }, []);

  const drawMap = useCallback(async () => {
    if (mapReady.current || !mapRef.current) return;
    try {
      const us = await d3.json<any>('/states-10m.json');
      if (!us || !mapRef.current) return;
      d3.select(mapRef.current).selectAll('*').remove();

      const W     = mapRef.current.offsetWidth || 580;
      const H     = Math.round(W * 0.6);
      const vals  = Object.values(countMap.current);
      const maxV  = vals.length ? Math.max(...vals) : 1;
      const color = d3.scaleQuantize<string>().domain([0, maxV]).range(BLUE_STOPS);
      const proj  = d3.geoAlbersUsa().scale(W * 1.22).translate([W / 2, H / 2]);
      const path  = d3.geoPath(proj);

      const svg = d3.select(mapRef.current)
        .append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('width', '100%')
        .style('display', 'block');

      const feats = (topojson.feature(us, us.objects.states) as any).features;

      svg.selectAll<SVGPathElement, any>('path')
        .data(feats).join('path')
        .attr('d', path as any)
        .attr('fill', (d: any) => {
          const v = countMap.current[d?.properties?.name] || 0;
          return v > 0 ? color(v) : '#E2E8F0';
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.6)
        .style('cursor', 'pointer')
        .on('click', (_: any, d: any) => {
          const abbr = FULL_TO_ABBR[d?.properties?.name] || '';
          if (abbr) selectFnRef.current(abbr);
        })
        .on('mouseover', function (this: SVGPathElement) {
          d3.select(this).attr('stroke', '#1E40AF').attr('stroke-width', 1.8).raise();
        })
        .on('mouseout', function (this: SVGPathElement, _: any, d: any) {
          const abbr  = FULL_TO_ABBR[d?.properties?.name] || '';
          const isSel = abbr === selectedRef.current;
          d3.select(this)
            .attr('stroke', isSel ? '#1E40AF' : '#fff')
            .attr('stroke-width', isSel ? 2.5 : 0.6);
        })
        .append('title')
        .text((d: any) =>
          `${d?.properties?.name}: ${(countMap.current[d?.properties?.name] || 0).toLocaleString()} labels`
        );

      mapReady.current = true;
    } catch (e) {
      console.error('[AdminStates] map error', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetch ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [bdRes, topRes] = await Promise.all([
        axios.get(`${EXT}/state-breakdown`,  { headers: EXT_HDR }),
        axios.get(`${EXT}/top-states`,       { headers: EXT_HDR }),
      ]);

      const bd: StateRow[]     = parseData(bdRes.data);
      const top: TopStateRow[] = parseData(topRes.data);

      // Filter out "UNKNOWN" state from main breakdown
      const filtered = bd.filter(r => r.state !== 'UNKNOWN');

      setBreakdown(filtered);
      setTopStates(top);
      setError('');

      const cm: Record<string, number> = {};
      for (const r of filtered) {
        const f = toFull(r.state);
        if (f) cm[f] = (cm[f] || 0) + (r.total || 0);
      }
      countMap.current = cm;
      refreshMap();
    } catch (e: any) {
      setError('Failed to load state data — ' + (e?.message || 'unknown error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshMap]);

  const fetchVendors = useCallback(async (abbr: string) => {
    setVendorLoading(true);
    setVendors([]);
    try {
      const res = await axios.get(
        `${EXT}/state-vendor-breakdown?state=${abbr}`,
        { headers: EXT_HDR }
      );
      setVendors(parseData(res.data));
    } catch {
      setVendors([]);
    } finally {
      setVendorLoading(false);
    }
  }, []);

  const selectState = useCallback((abbr: string) => {
    const next = selectedRef.current === abbr ? null : abbr;
    selectedRef.current = next;
    setSelected(next);
    if (next) fetchVendors(next); else setVendors([]);
    highlightMap(next);
  }, [fetchVendors, highlightMap]);

  useEffect(() => { selectFnRef.current = selectState; }, [selectState]);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!loading && mapRef.current && !mapReady.current) drawMap();
  }, [loading, drawMap]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalLabels  = breakdown.reduce((s, r) => s + (r.total || 0), 0);
  const totalDel     = breakdown.reduce((s, r) => s + (r.delivered || 0), 0);
  const avgDelRate   = breakdown.length
    ? breakdown.reduce((s, r) => s + (r.deliveryRate || 0), 0) / breakdown.length
    : 0;
  const maxTotal     = breakdown.reduce((m, r) => Math.max(m, r.total || 0), 1);
  const topState     = [...breakdown].sort((a, b) => b.total - a.total)[0];

  const topList = topStates.length > 0
    ? topStates
    : [...breakdown].sort((a, b) => b.total - a.total).slice(0, 10).map(r => ({
        state: r.state, totalLabels: r.total, bestVendor: '', bestRate: r.deliveryRate, vendorCount: 0,
      }));
  const maxTopLabels = topList[0]?.totalLabels || 1;

  const vendorTotal  = vendors.reduce((s, v) => s + (v.total || 0), 0) || 1;

  const sorted = [...breakdown]
    .filter(r => {
      const q = search.toLowerCase();
      return !q
        || toFull(r.state).toLowerCase().includes(q)
        || r.state.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'state')        return m * toFull(a.state).localeCompare(toFull(b.state));
      if (sortKey === 'total')        return m * ((a.total        || 0) - (b.total        || 0));
      if (sortKey === 'deliveryRate') return m * ((a.deliveryRate || 0) - (b.deliveryRate || 0));
      if (sortKey === 'exception')    return m * ((a.exception    || 0) - (b.exception    || 0));
      return 0;
    });

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background:   'var(--card-bg,#fff)',
    border:       '1.5px solid var(--navy-150,#e8edf5)',
    borderRadius: 14,
    padding:      '1.1rem 1.4rem',
    boxShadow:    '0 1px 4px rgba(15,23,42,0.06)',
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12,
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );
  if (error && !breakdown.length) return (
    <div style={{ padding: '2rem', color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>
            State Analytics
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--navy-400)' }}>
            Label volume and delivery breakdown by US state
          </p>
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 16px', borderRadius: 9,
            border: '1.5px solid var(--navy-200)',
            background: 'var(--card-bg,#fff)', color: 'var(--navy-700)',
            fontSize: '0.8rem', fontWeight: 600,
            cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.6 : 1,
          }}
        >
          <ArrowPathIcon style={{ width: 15, height: 15, animation: refreshing ? 'sa-spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Labels',    value: fmt(totalLabels),        bg: '#EFF6FF', icon: '📦' },
          { label: 'Delivered',       value: fmt(totalDel),           bg: '#F0FDF4', icon: '✅' },
          { label: 'Active States',   value: String(breakdown.filter(r => r.total > 0).length), bg: '#FFFBEB', icon: '🗺️' },
          { label: 'Avg Delivery Rate', value: fmtR(avgDelRate),      bg: '#F5F3FF', icon: '📈' },
        ].map(c => (
          <div key={c.label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {c.label}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--navy-900)', marginTop: 2 }}>
                {c.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Map + Top States */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 16, marginBottom: 20, alignItems: 'start' }}>

        {/* Choropleth */}
        <div style={card}>
          <div style={sectionLabel}>Label Volume by State — click to see vendors</div>
          <div ref={mapRef} style={{ width: '100%', minHeight: 180 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: '0.67rem', color: 'var(--navy-400)' }}>Low</span>
            <div style={{ flex: 1, height: 7, borderRadius: 99, background: `linear-gradient(90deg,${BLUE_STOPS.join(',')})` }} />
            <span style={{ fontSize: '0.67rem', color: 'var(--navy-400)' }}>High</span>
          </div>
        </div>

        {/* Top States */}
        <div style={{ ...card, maxHeight: 420, overflowY: 'auto' }}>
          <div style={sectionLabel}>Top States</div>
          {topList.map((r, i) => {
            const full  = toFull(r.state);
            const abbr  = toAbbr(r.state) || r.state;
            const isSel = selected === abbr;
            return (
              <div
                key={abbr + i}
                onClick={() => selectState(abbr)}
                style={{
                  padding: '8px 9px', borderRadius: 8, marginBottom: 5, cursor: 'pointer',
                  background: isSel ? '#EFF6FF' : 'transparent',
                  border: `1px solid ${isSel ? '#BFDBFE' : 'transparent'}`,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'var(--navy-50,#f8fafc)'; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 800, flexShrink: 0,
                      background: i < 3 ? '#FEF9C3' : '#F1F5F9',
                      color: i < 3 ? '#D97706' : '#64748B',
                    }}>{i + 1}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-800)' }}>{full || abbr}</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3B82F6' }}>{fmt(r.totalLabels)}</span>
                </div>
                {r.bestVendor && (
                  <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', paddingLeft: 27, marginBottom: 4 }}>
                    Best: {r.bestVendor} ({r.bestRate}%)
                  </div>
                )}
                <div style={{ height: 4, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#3B82F6,#6366F1)', width: `${Math.round((r.totalLabels / maxTopLabels) * 100)}%`, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vendor breakdown panel */}
      {selected && (
        <div style={{ ...card, marginBottom: 20, borderColor: '#BFDBFE', borderWidth: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Vendor Breakdown —{' '}
              </span>
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1D4ED8' }}>
                {toFull(selected) || selected} ({selected})
              </span>
            </div>
            <button
              onClick={() => { setSelected(null); setVendors([]); highlightMap(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
            >
              ✕
            </button>
          </div>

          {vendorLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
              <div className="spinner" />
            </div>
          ) : vendors.length === 0 ? (
            <div style={{ color: 'var(--navy-400)', fontSize: '0.83rem' }}>No vendor data available.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--navy-100)' }}>
                    {['Vendor', 'Total', 'Delivered', 'In Transit', 'Exceptions', 'Delivery Rate'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Vendor' ? 'left' : 'right', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...vendors].sort((a, b) => b.total - a.total).map((v, i) => (
                    <tr key={v.vendor + i} style={{ borderBottom: '1px solid var(--navy-50)', background: i % 2 === 0 ? 'transparent' : 'var(--navy-25,#fafbfc)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--navy-800)', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.vendor}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(v.total)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#22C55E', fontWeight: 600 }}>{fmt(v.delivered)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#3B82F6', fontWeight: 600 }}>{fmt(v.inTransit)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: v.exception > 0 ? '#EF4444' : 'var(--navy-400)', fontWeight: 600 }}>{fmt(v.exception)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 50, height: 4, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 99, background: v.deliveryRate >= 50 ? '#22C55E' : v.deliveryRate >= 20 ? '#F59E0B' : '#EF4444', width: `${Math.min(100, v.deliveryRate)}%` }} />
                          </div>
                          <span style={{ fontWeight: 700, color: v.deliveryRate >= 50 ? '#22C55E' : v.deliveryRate >= 20 ? '#F59E0B' : '#EF4444', minWidth: 38, textAlign: 'right' }}>
                            {fmtR(v.deliveryRate)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Full state table */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={sectionLabel}>All States ({sorted.length})</div>
          <input
            type="text"
            placeholder="Search state…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--navy-200)', fontSize: '0.8rem', outline: 'none', width: 180, background: 'var(--card-bg,#fff)', color: 'var(--navy-800)' }}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--navy-100)' }}>
                {[
                  { k: 'state',        label: 'State'         },
                  { k: 'total',        label: 'Total'         },
                  { k: null,           label: 'Delivered'     },
                  { k: null,           label: 'In Transit'    },
                  { k: 'exception',    label: 'Exceptions'    },
                  { k: 'deliveryRate', label: 'Delivery Rate' },
                ].map(col => (
                  <th
                    key={col.label}
                    onClick={() => col.k && toggleSort(col.k as any)}
                    style={{
                      textAlign: col.label === 'State' ? 'left' : 'right',
                      padding: '8px 12px', cursor: col.k ? 'pointer' : 'default', userSelect: 'none',
                      fontWeight: 700, color: 'var(--navy-500)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.7rem', whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}{' '}
                    {col.k && (sortKey === col.k
                      ? <span style={{ color: '#3B82F6' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      : <span style={{ opacity: 0.3 }}>↕</span>
                    )}
                  </th>
                ))}
                <th style={{ padding: '8px 12px', width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--navy-400)' }}>No states found.</td></tr>
              ) : sorted.map((r, i) => {
                const full  = toFull(r.state);
                const abbr  = toAbbr(r.state) || r.state;
                const isSel = selected === abbr;
                return (
                  <tr
                    key={abbr + i}
                    onClick={() => selectState(abbr)}
                    style={{
                      borderBottom: '1px solid var(--navy-50)',
                      background: isSel ? '#EFF6FF' : i % 2 === 0 ? 'transparent' : 'var(--navy-25,#fafbfc)',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--navy-50,#f8fafc)'; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? 'transparent' : 'var(--navy-25,#fafbfc)'; }}
                  >
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'inline-block', minWidth: 32, textAlign: 'center', padding: '2px 7px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontSize: '0.72rem', fontWeight: 800 }}>
                          {abbr}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--navy-800)' }}>{full || abbr}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                        <div style={{ width: 50, height: 4, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: '#3B82F6', width: `${Math.round(((r.total || 0) / maxTotal) * 100)}%` }} />
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--navy-800)', minWidth: 52, textAlign: 'right' }}>{fmt(r.total || 0)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#22C55E', fontWeight: 600 }}>{fmt(r.delivered)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#3B82F6', fontWeight: 600 }}>{fmt(r.inTransit)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: r.exception > 0 ? '#EF4444' : 'var(--navy-400)', fontWeight: 600 }}>{fmt(r.exception)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 44, height: 4, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: r.deliveryRate >= 50 ? '#22C55E' : r.deliveryRate >= 20 ? '#F59E0B' : '#EF4444', width: `${Math.min(100, r.deliveryRate)}%` }} />
                        </div>
                        <span style={{ fontWeight: 700, minWidth: 42, textAlign: 'right', color: r.deliveryRate >= 50 ? '#22C55E' : r.deliveryRate >= 20 ? '#F59E0B' : '#EF4444' }}>
                          {fmtR(r.deliveryRate)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#3B82F6', fontWeight: 600 }}>
                        {isSel ? '▲ Hide' : 'Vendors →'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes sa-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 860px) {
          .sa-map-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
};

export default AdminStates;
